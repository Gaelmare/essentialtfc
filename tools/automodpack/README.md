# AutoModpack tooling

The TFC Tuesday server hands the pack to players with [AutoModpack](https://modrinth.com/project/automodpack). These tools build the server's `automodpack/` folder from the TFCT CurseForge export, and check a deployed server against that export.

Needs Python 3.11+ and GNU tar with zstd.

## Build

`build.sh` runs this after it makes `TFCT-<version>.zip`:

```bash
python3 tools/automodpack/automodpack.py build TFCT-3.0.14.zip --jars ~/instance/mods:~/instance/resourcepacks:~/instance/shaderpacks
```

It writes `.out/automodpack/TFCT-<version>/` and `.out/automodpack/TFCT-<version>-automodpack.tzst`:

- `automodpack/automodpack-server.json`: copied from `automodpack-server.json` here. Edit that file to change the host config.
- `automodpack/host-modpack/main/`: everything a player installing the export would get, except `server`-side mods and the top-level README, CHANGELOG and LICENSE:
  - the export's overrides (kubejs, config, defaultconfigs, resource packs)
  - every client mod, resource pack and shader pack, copied from the `--jars` folders, matched by sha1
- `expected-content.json`: every file the export installs, with sha1 and side. It isn't in the archive.

Files missing from the `--jars` folders are listed, and the rest of the output is still written. `build.sh` passes `$AUTOMODPACK_JARS` as `--jars`; without it, no jars or packs are copied.

## Compare

```bash
python3 tools/automodpack/automodpack.py compare TFCT-3.0.14.zip tfct-automodpack-mods-101526.tzst
python3 tools/automodpack/automodpack.py compare TFCT-3.0.14.zip SERVER --client "automodpack/modpacks/TFC Tuesday 2026"
```

`SERVER` is a server snapshot holding `automodpack/` and `mods/`, either a folder or a `.tzst`. It reports:

- what clients are sent (the server's `automodpack-content.json`) against what the export installs
- the mods the server loads against the pack's `both`/`server` mods
- `automodpack-server.json` against the template here
- stale packwiz metadata in the server's `mods/.index`

`--client` also checks a player's downloaded copy against the server's list. The exit status is 1 when anything differs.

## Snapshots

Server and client snapshots contain secrets: `automodpack/.private/` holds the server's TLS key, or a player's connection secret. `.gitignore` and `.packwizignore` exclude `/automodpack/` and `*.tzst`, and `compare` unpacks archives without `.private`. To look inside a snapshot yourself:

```bash
tar --zstd -tvf snapshot.tzst | less                                  # list
mkdir -p /tmp/snap && tar --zstd -xf snapshot.tzst -C /tmp/snap --exclude=.private
tar --zstd -xOf snapshot.tzst automodpack/automodpack-server.json     # one file to stdout
```
