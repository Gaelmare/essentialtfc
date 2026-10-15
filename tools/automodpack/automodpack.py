#!/usr/bin/env python3
"""Build AutoModpack host files from a CurseForge export, and check a deployment against it.

  automodpack.py build TFCT-3.0.14.zip [--jars DIR ...] [--out .out/automodpack]
  automodpack.py compare TFCT-3.0.14.zip SERVER [--client CLIENT]

SERVER is a server snapshot holding automodpack/ and mods/, either a directory or a
zstd tar (.tzst). CLIENT is a player's automodpack/modpacks/<name> directory.
Archives are unpacked without automodpack/.private, which holds the server's keys.
"""

import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import zipfile

REPO = pathlib.Path(__file__).resolve().parents[2]
TEMPLATE = pathlib.Path(__file__).with_name('automodpack-server.json')

# Top-level documents in the export's overrides; not game files, so clients don't need them.
SKIP_OVERRIDES = {'README.md', 'CHANGELOG.md', 'LICENSE.txt'}

HOST = pathlib.PurePosixPath('automodpack/host-modpack/main')
CONTENT = 'automodpack/host-modpack/automodpack-content.json'


def sha1_bytes(data):
    return hashlib.sha1(data).hexdigest()


def sha1_file(path):
    digest = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load_packwiz():
    """Maps each packwiz filename to its sha1, side, install path and CurseForge ids."""
    meta = {}
    for sub in ('mods', 'resourcepacks', 'shaderpacks'):
        for path in sorted((REPO / sub).glob('*.pw.toml')):
            data = tomllib.loads(path.read_text())
            download = data['download']
            cf = data.get('update', {}).get('curseforge')
            name = data['filename']
            if sub == 'mods' and name.endswith('.zip'):
                # packwiz keeps CurseForge shader packs under mods/.
                install = f'/shaderpacks/{name}'
            else:
                install = f'/{sub}/{name}'
            meta[name] = {
                'sha1': download['hash'] if download.get('hash-format') == 'sha1' else None,
                'side': data.get('side', 'both'),
                'install': install,
                'cf': (cf['project-id'], cf['file-id']) if cf else None,
            }
    return meta


def expected_files(zip_path, packwiz):
    """Every file the export installs, keyed by install path ('/mods/x.jar')."""
    by_cf = {m['cf']: name for name, m in packwiz.items() if m['cf']}
    files = {}
    with zipfile.ZipFile(zip_path) as z:
        manifest = json.loads(z.read('manifest.json'))
        for entry in manifest['files']:
            name = by_cf.get((entry['projectID'], entry['fileID']))
            if name is None:
                sys.exit(f"{zip_path}: CurseForge file {entry['projectID']}/{entry['fileID']} "
                         f"has no packwiz metadata in {REPO}")
            m = packwiz[name]
            files[m['install']] = {'sha1': m['sha1'], 'side': m['side'], 'source': 'curseforge'}

        for info in z.infolist():
            if info.is_dir() or not info.filename.startswith('overrides/'):
                continue
            rel = info.filename[len('overrides/'):]
            if rel in SKIP_OVERRIDES:
                continue
            m = packwiz.get(pathlib.PurePosixPath(rel).name) if rel.startswith('mods/') else None
            files['/' + rel] = {
                'sha1': sha1_bytes(z.read(info)),
                'side': m['side'] if m else 'both',
                'source': 'override',
            }
    return manifest, files


def client_bound(info):
    return info['side'] != 'server'


def server_bound(path, info):
    return path.startswith('/mods/') and info['side'] != 'client'


def index_jars(dirs):
    """sha1 -> path for every file under the given directories."""
    found = {}
    for d in dirs:
        for path in pathlib.Path(d).expanduser().rglob('*'):
            if path.is_file() and path.suffix in ('.jar', '.zip'):
                found.setdefault(sha1_file(path), path)
    return found


def build(args):
    packwiz = load_packwiz()
    manifest, files = expected_files(args.zip, packwiz)
    base = pathlib.Path(args.out)
    out = base / pathlib.Path(args.zip).stem
    if out.exists():
        shutil.rmtree(out)
    host = out / HOST

    jar_dirs = [d for arg in args.jars for d in arg.split(os.pathsep) if d]
    jars = index_jars(jar_dirs)
    missing = []
    with zipfile.ZipFile(args.zip) as z:
        for path, info in sorted(files.items()):
            if not client_bound(info):
                continue
            dest = host / path.lstrip('/')
            dest.parent.mkdir(parents=True, exist_ok=True)
            if info['source'] == 'override':
                dest.write_bytes(z.read('overrides' + path))
            elif info['sha1'] in jars:
                shutil.copyfile(jars[info['sha1']], dest)
            else:
                missing.append(path)

    shutil.copyfile(TEMPLATE, out / 'automodpack' / 'automodpack-server.json')
    (out / 'expected-content.json').write_text(json.dumps({
        'name': manifest['name'],
        'version': manifest['version'],
        'minecraft': manifest['minecraft']['version'],
        'loader': manifest['minecraft']['modLoaders'][0]['id'],
        'files': files,
    }, indent=2, sort_keys=True) + '\n')

    archive = base / f'{out.name}-automodpack.tzst'
    subprocess.run(['tar', '--zstd', '-cf', str(archive), '-C', str(out), 'automodpack'], check=True)
    print(f'Wrote {out} and {archive}')

    if missing:
        print(f'{len(missing)} CurseForge files not found by sha1'
              + (' in ' + ', '.join(jar_dirs) if jar_dirs else ' (pass --jars to copy them in)') + ':')
        for path in missing:
            print(f'  {path}')
        return 1 if jar_dirs else 0
    return 0


# --- compare -------------------------------------------------------------------------------

def mod_key(path):
    """Name with the version stripped, to pair up different versions of the same mod."""
    return re.split(r'[-_ +]v?\d', pathlib.PurePosixPath(path).name, maxsplit=1)[0].lower()


def diff_sets(expected, actual):
    """(missing, extra, changed, version pairs) between two path -> sha1 maps."""
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    changed = sorted(p for p in set(expected) & set(actual)
                     if expected[p] and actual[p] and expected[p] != actual[p])
    pairs = []
    for m in list(missing):
        for e in extra:
            if pathlib.PurePosixPath(m).parent == pathlib.PurePosixPath(e).parent and mod_key(m) == mod_key(e):
                pairs.append((m, e))
                missing.remove(m)
                extra.remove(e)
                break
    return missing, extra, changed, pairs


def open_snapshot(path, stack):
    path = pathlib.Path(path)
    if path.is_dir():
        return path
    tmp = stack.enter_context(tempfile.TemporaryDirectory(prefix='automodpack-'))
    subprocess.run(['tar', '--zstd', '-xf', str(path), '-C', tmp, '--exclude=.private'], check=True)
    return pathlib.Path(tmp)


def collapse(items, threshold=5):
    """Folds `threshold` or more entries with the same note from one asset-depth directory
    (/kubejs/textures/block, not /mods) into one line."""
    groups = {}
    for item in items:
        path, _, note = item.partition('  ')
        groups.setdefault((str(pathlib.PurePosixPath(path).parent), note), []).append(item)
    lines = []
    for (parent, note), members in groups.items():
        if len(members) >= threshold and parent.count('/') >= 3:
            lines.append(f'{parent}/*  ({len(members)} files){"  " + note if note else ""}')
        else:
            lines.extend(members)
    return sorted(lines, key=str.lower)


class Report:
    def __init__(self):
        self.count = 0

    def section(self, title, items, note=None):
        if not items:
            return
        self.count += len(items)
        print(f'\n## {title} ({len(items)})')
        if note:
            print(note)
        for line in collapse(items):
            print(f'  {line}')


def compare(args):
    import contextlib
    packwiz = load_packwiz()
    manifest, files = expected_files(args.zip, packwiz)
    report = Report()

    with contextlib.ExitStack() as stack:
        server = open_snapshot(args.server, stack)
        content = json.loads((server / CONTENT).read_text())
        sent = {f['file']: f['sha1'] for f in content['list']}
        host_dir = server / HOST
        host = {'/' + p.relative_to(host_dir).as_posix() for p in host_dir.rglob('*') if p.is_file()}
        server_mods = {f'/mods/{p.name}': sha1_file(p) for p in (server / 'mods').glob('*.jar')}
        config = json.loads((server / 'automodpack/automodpack-server.json').read_text())
        index_dir = server / 'mods/.index'
        index = sorted(index_dir.glob('*.pw.toml')) if index_dir.is_dir() else []

        print(f"# {manifest['name']} {manifest['version']} ({args.zip}) vs {args.server}")
        print(f"AutoModpack {content.get('automodpackVersion')}, "
              f"{content.get('loader')} {content.get('loaderVersion')}, Minecraft {content.get('mcVersion')}")

        expected_loader = manifest['minecraft']['modLoaders'][0]['id'].split('-', 1)[-1]
        if content.get('loaderVersion') != expected_loader:
            report.section('Loader version', [f"pack {expected_loader}, server {content.get('loaderVersion')}"])

        # What clients are sent, against what the export installs.
        want = {p: i['sha1'] for p, i in files.items() if client_bound(i)}
        via = lambda p: '  (host-modpack)' if p in host else '  (server dir)'
        missing, extra, changed, pairs = diff_sets(want, sent)
        report.section('Sent to clients: different version', [f'{m}  ->  {e}{via(e)}' for m, e in pairs])
        report.section('Sent to clients: different content', [p + via(p) for p in changed])
        report.section('In the pack but not sent to clients', missing)
        report.section('Sent to clients but not in the pack', [p + via(p) for p in extra])

        # Mods the server itself loads.
        want = {p: i['sha1'] for p, i in files.items() if server_bound(p, i)}
        missing, extra, changed, pairs = diff_sets(want, server_mods)
        report.section('Server mods: different version', [f'{m}  ->  {e}' for m, e in pairs])
        report.section('Server mods: different content', changed)
        report.section('Pack mods the server does not load', [
            m + ('  (clients get it from host-modpack)' if m in host else '') for m in missing])
        report.section('Server mods not in the pack', [
            e + ('' if e in sent else '  (not sent to clients)') for e in extra])

        # Host config against the committed template.
        template = json.loads(TEMPLATE.read_text())
        report.section('automodpack-server.json differs from tools/automodpack/automodpack-server.json', [
            f'{k}: template {json.dumps(template.get(k))}, server {json.dumps(config.get(k))}'
            for k in sorted(set(template) | set(config)) if template.get(k) != config.get(k)])

        if '!/kubejs/server_scripts/**' in config.get('syncedFiles', []) and any(
                p.startswith('/kubejs/server_scripts/') for p in sent):
            report.section('Exclusion not applied', [
                '"!/kubejs/server_scripts/**" is in syncedFiles, but server_scripts are still sent to clients'])

        stale = [p.name for p in index if not (REPO / 'mods' / p.name).is_file()
                 or (REPO / 'mods' / p.name).read_bytes() != p.read_bytes()]
        report.section('Stale packwiz metadata in the server mods/.index', stale,
                       'These no longer match the repo; running packwiz-installer there would change mods.')

        if args.client:
            client = pathlib.Path(args.client)
            got = json.loads((client / 'automodpack-content.json').read_text())
            got_files = {f['file']: f['sha1'] for f in got['list']}
            missing, extra, changed, pairs = diff_sets(sent, got_files)
            report.section('Client manifest: different version from server', [f'{m}  ->  {e}' for m, e in pairs])
            report.section('Client manifest: different content from server', changed)
            report.section('Client manifest is missing', missing)
            report.section('Client manifest has extra', extra)
            on_disk = []
            for path, digest in sorted(got_files.items()):
                local = client / path.lstrip('/')
                if not local.is_file():
                    on_disk.append(f'{path}  (missing)')
                elif sha1_file(local) != digest:
                    on_disk.append(f'{path}  (edited or corrupt)')
            report.section('Client files that do not match the client manifest', on_disk)

    print(f'\n{report.count} difference(s).' if report.count else '\nNo differences.')
    return 1 if report.count else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('build', help='write automodpack/ host files for a CurseForge export')
    p.add_argument('zip', help='CurseForge export, such as TFCT-3.0.14.zip')
    p.add_argument('--out', default=str(REPO / '.out' / 'automodpack'))
    p.add_argument('--jars', action='append', default=[],
                   help=f'directory of mod/pack files to copy in, matched by sha1; repeatable or {os.pathsep}-separated')
    p.set_defaults(func=build)

    p = sub.add_parser('compare', help='list differences between an export and a deployed server')
    p.add_argument('zip', help='CurseForge export, such as TFCT-3.0.14.zip')
    p.add_argument('server', help='server snapshot: directory or .tzst holding automodpack/ and mods/')
    p.add_argument('--client', help="player's automodpack/modpacks/<name> directory")
    p.set_defaults(func=compare)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == '__main__':
    main()
