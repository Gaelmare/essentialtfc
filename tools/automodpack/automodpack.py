#!/usr/bin/env python3
"""Build the TFC Tuesday AutoModpack server bundle from a CurseForge export, and check a
deployment against it.

  automodpack.py build TFCT-3.0.14.zip [--jars DIR ...] [--out .out/automodpack]
  automodpack.py compare TFCT-3.0.14.zip SERVER [--client CLIENT]

SERVER is a server snapshot holding automodpack/ and mods/ (and optionally kubejs/), either
a directory or a zstd tar (.tzst). CLIENT is a player's automodpack/modpacks/<name> directory.
Archives are unpacked without automodpack/.private, which holds the server's keys.
"""

import argparse
import contextlib
import hashlib
import io
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

TOOL = pathlib.Path(__file__).resolve().parent
REPO = TOOL.parents[1]
TEMPLATE = TOOL / 'automodpack-server.json'
CONFIG = json.loads((TOOL / 'tfct.json').read_text())

# Top-level documents in the export's overrides; not game files, so clients don't need them.
SKIP_OVERRIDES = {'README.md', 'CHANGELOG.md', 'LICENSE.txt'}

HOST = pathlib.PurePosixPath('automodpack/host-modpack/main')
CONTENT = 'automodpack/host-modpack/automodpack-content.json'

DEPLOY = """\
# Deploying {name} {version} to the AutoModpack server

Stop the server first. Leave `automodpack/.private/` and `automodpack/automodpack-client.json`
alone: they hold the server's keys and aren't in this bundle.

1. Delete these from the server folder:
   - `mods/`, including the old packwiz metadata in `mods/.index/`
   - `kubejs/`
   - `automodpack/host-modpack/`
2. Extract this archive into the server folder, so `mods/`, `kubejs/` and `automodpack/`
   land at the top level. This replaces `automodpack/automodpack-server.json`.
3. Start the server. AutoModpack regenerates `automodpack/host-modpack/automodpack-content.json`
   and KubeJS recreates its default `kubejs/config/common.json` and `web_server.json`.

Players are sent exactly `automodpack/host-modpack/main/`. The server folder's `mods/` and
`kubejs/` are no longer synced; players get the pack's `kubejs/`, server scripts included, so
single player works. Mods this bundle puts only in the server's `mods/`, not in what players
are sent:

{server_only}

AutoModpack, if listed, still runs on players' clients: they get it from the seed modpack
they install, not from this sync.
"""


def sha1_bytes(data):
    return hashlib.sha1(data).hexdigest()


def sha1_file(path):
    digest = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load_packwiz():
    """Maps each packwiz filename to its slug, sha1, side, install path and CurseForge ids."""
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
                'slug': path.name.removesuffix('.pw.toml'),
                'sha1': download['hash'] if download.get('hash-format') == 'sha1' else None,
                'side': data.get('side', 'both'),
                'install': install,
                'cf': (cf['project-id'], cf['file-id']) if cf else None,
            }
    return meta


def export_files(zip_path, packwiz):
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
            files[m['install']] = {'sha1': m['sha1'], 'side': m['side'], 'slug': m['slug'], 'source': 'jars'}

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
                'slug': m['slug'] if m else None,
                'source': 'override',
            }
    return manifest, files


def plan(zip_path):
    """Splits the export into what players are sent (host) and what the server loads (server)."""
    manifest, files = export_files(zip_path, load_packwiz())
    client_only = set(CONFIG['clientOnly'])
    not_shipped = set(CONFIG['notShipped'])
    host, server = {}, {}
    for path, info in files.items():
        if info['slug'] in not_shipped:
            continue
        if info['side'] != 'server':
            host[path] = info
        if path.startswith('/kubejs/') or (
                path.startswith('/mods/') and info['side'] != 'client' and info['slug'] not in client_only):
            server[path] = info

    for built in CONFIG['builtPacks']:
        host['/' + built['file']] = {'sha1': None, 'side': 'client', 'source': 'built', 'pack': built}

    overlay = TOOL / CONFIG['hostOverlay']
    for source in sorted(p for p in overlay.rglob('*') if p.is_file()):
        host['/' + source.relative_to(overlay).as_posix()] = {
            'sha1': sha1_file(source), 'side': 'client', 'source': 'repo', 'path': str(source)}

    for extra in CONFIG['extraMods']:
        if 'source' in extra:
            source = TOOL / extra['source']
            info = {'sha1': sha1_file(source), 'side': extra['side'], 'source': 'repo', 'path': str(source)}
        else:
            info = {'sha1': extra['sha1'], 'side': extra['side'], 'source': 'jars'}
        if extra['side'] != 'client':
            server['/mods/' + extra['file']] = info
        if extra['side'] != 'server':
            host['/mods/' + extra['file']] = dict(info)
    return manifest, host, server


# --- build ---------------------------------------------------------------------------------

def index_jars(dirs):
    """sha1 -> path for every jar and zip under the given directories."""
    found = {}
    for d in dirs:
        for path in pathlib.Path(d).expanduser().rglob('*'):
            if path.is_file() and path.suffix in ('.jar', '.zip'):
                found.setdefault(sha1_file(path), path)
    return found


def build_pack(pack, base_data):
    """Rebuilds a shader pack zip from its base with the replacement files from the repo."""
    replace = {inner: (REPO / src).read_bytes() for inner, src in pack['replace'].items()}
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(base_data)) as base, zipfile.ZipFile(out, 'w') as new:
        missing = set(replace) - set(base.namelist())
        if missing:
            sys.exit(f"{pack['base']} has no {', '.join(sorted(missing))} to replace")
        for info in base.infolist():
            data = replace.get(info.filename)
            new.writestr(info, base.read(info) if data is None else data, compress_type=info.compress_type)
    return out.getvalue()


def build(args):
    manifest, host, server = plan(args.zip)
    base = pathlib.Path(args.out)
    out = base / pathlib.Path(args.zip).stem
    if out.exists():
        shutil.rmtree(out)

    jar_dirs = [d for arg in args.jars for d in arg.split(os.pathsep) if d]
    jars = index_jars(jar_dirs)
    missing = []

    def data_for(path, info, z):
        if info['source'] == 'override':
            return z.read('overrides' + path)
        if info['source'] == 'repo':
            return pathlib.Path(info['path']).read_bytes()
        if info['source'] == 'built':
            base_sha1 = info['pack']['baseSha1']
            if base_sha1 not in jars:
                return None
            return build_pack(info['pack'], jars[base_sha1].read_bytes())
        return jars[info['sha1']].read_bytes() if info['sha1'] in jars else None

    with zipfile.ZipFile(args.zip) as z:
        for root, files in ((out / HOST, host), (out, server)):
            for path, info in sorted(files.items()):
                data = data_for(path, info, z)
                if data is None:
                    missing.append(path)
                    continue
                info['sha1'] = sha1_bytes(data)
                dest = root / path.lstrip('/')
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)

    shutil.copyfile(TEMPLATE, out / 'automodpack' / 'automodpack-server.json')
    server_only = sorted(p for p in server if p.startswith('/mods/') and p not in host)
    (out / 'DEPLOY.md').write_text(DEPLOY.format(
        name=manifest['name'], version=manifest['version'],
        server_only='\n'.join(f'- `{p[len("/mods/"):]}`' for p in server_only)))
    (base / f'{out.name}-expected.json').write_text(json.dumps({
        'name': manifest['name'],
        'version': manifest['version'],
        'host': host,
        'server': server,
    }, indent=2, sort_keys=True, default=str) + '\n')

    if missing:
        print(f'Wrote {out}, but not the archive: {len(missing)} files were not found by sha1'
              + (' in ' + ', '.join(jar_dirs) if jar_dirs else ' (pass --jars to copy them in)') + ':')
        for path in sorted(set(missing)):
            print(f'  {path}')
        return 1 if jar_dirs else 0

    archive = base / f'{out.name}-automodpack.tzst'
    subprocess.run(['tar', '--zstd', '-cf', str(archive), '-C', str(out),
                    'automodpack', 'mods', 'kubejs', 'DEPLOY.md'], check=True)
    print(f'Wrote {archive}; see {out / "DEPLOY.md"}')
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


def check_built(pack, zip_path):
    """Differences between a deployed built pack and the replacement files in the repo."""
    problems = []
    with zipfile.ZipFile(zip_path) as z:
        for inner, src in pack['replace'].items():
            if inner not in z.namelist():
                problems.append(f'/{pack["file"]}: no {inner}')
            elif sha1_bytes(z.read(inner)) != sha1_file(REPO / src):
                problems.append(f'/{pack["file"]}: {inner} differs from {src}')
    return problems


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
    manifest, host_plan, server_plan = plan(args.zip)
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

        print(f"# {manifest['name']} {manifest['version']} ({args.zip}) vs {args.server}")
        print(f"AutoModpack {content.get('automodpackVersion')}, "
              f"{content.get('loader')} {content.get('loaderVersion')}, Minecraft {content.get('mcVersion')}")

        expected_loader = manifest['minecraft']['modLoaders'][0]['id'].split('-', 1)[-1]
        if content.get('loaderVersion') != expected_loader:
            report.section('Loader version', [f"pack {expected_loader}, server {content.get('loaderVersion')}"])

        # What players are sent, against the planned host-modpack.
        want = {p: i['sha1'] for p, i in host_plan.items()}
        via = lambda p: '  (host-modpack)' if p in host else '  (server dir)'
        missing, extra, changed, pairs = diff_sets(want, sent)
        report.section('Sent to clients: different version', [f'{m}  ->  {e}{via(e)}' for m, e in pairs])
        report.section('Sent to clients: different content', [p + via(p) for p in changed])
        report.section('Not sent to clients', missing)
        report.section('Sent to clients but not planned', [p + via(p) for p in extra])
        built = []
        for pack in CONFIG['builtPacks']:
            if '/' + pack['file'] in host:
                built += check_built(pack, host_dir / pack['file'])
        report.section('Built shader packs that differ from the repo', built)

        # Mods the server itself loads.
        want = {p: i['sha1'] for p, i in server_plan.items() if p.startswith('/mods/')}
        missing, extra, changed, pairs = diff_sets(want, server_mods)
        report.section('Server mods: different version', [f'{m}  ->  {e}' for m, e in pairs])
        report.section('Server mods: different content', changed)
        report.section('Server mods missing', missing)
        report.section('Server mods not planned', [e + ('' if e in sent else '  (not sent to clients)') for e in extra])

        if (server / 'kubejs').is_dir():
            kubejs = {'/' + p.relative_to(server).as_posix(): sha1_file(p)
                      for p in (server / 'kubejs').rglob('*') if p.is_file()}
            want = {p: i['sha1'] for p, i in server_plan.items() if p.startswith('/kubejs/')}
            missing, extra, changed, _ = diff_sets(want, kubejs)
            report.section('Server kubejs: different content', changed)
            report.section('Server kubejs missing', missing)
            report.section('Server kubejs not planned', extra)
        else:
            print('\n(The snapshot has no kubejs/, so the server\'s kubejs files are not checked.)')

        # Host config against the committed template.
        template = json.loads(TEMPLATE.read_text())
        report.section('automodpack-server.json differs from tools/automodpack/automodpack-server.json', [
            f'{k}: template {json.dumps(template.get(k))}, server {json.dumps(config.get(k))}'
            for k in sorted(set(template) | set(config)) if template.get(k) != config.get(k)])

        if index_dir.is_dir():
            report.section('Old packwiz metadata in the server mods/.index', sorted(p.name for p in index_dir.iterdir()),
                           'Nothing reads it; running packwiz-installer there would change mods.')

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

    p = sub.add_parser('build', help='write the AutoModpack server bundle for a CurseForge export')
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
