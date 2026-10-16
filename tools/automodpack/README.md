# AutoModpack tooling

The TFC Tuesday server hands the pack to players with [AutoModpack](https://modrinth.com/project/automodpack). These tools build the server's `mods/`, `kubejs/` and `automodpack/` folders from the TFCT CurseForge export, and check a deployed server against that export.

Needs Python 3.11+ and GNU tar with zstd.

## How the server is laid out

AutoModpack sends players everything in `automodpack/host-modpack/main/`, plus any files in the server folder that match `syncedFiles` in `automodpack-server.json`. The build fills host-modpack with exactly what players need, and the template syncs nothing else from the server folder. So:

- players get the export's files, minus `kubejs/server_scripts` and server-only mods
- the server's `mods/` holds the pack's server-side mods plus the extras in `tfct.json` (AutoModpack itself, and gogetem), which never reach players
- the server's `kubejs/` is the export's `kubejs/`, including `server_scripts`

## Build

`build.sh` runs this after it makes `TFCT-<version>.zip`:

```bash
python3 tools/automodpack/automodpack.py build TFCT-3.0.14.zip --jars ~/instance/mods:~/instance/resourcepacks:~/instance/shaderpacks
```

It writes `.out/automodpack/TFCT-<version>/`, holding `automodpack/`, `mods/`, `kubejs/` and `DEPLOY.md` (how to install it on the server), then archives it as `.out/automodpack/TFCT-<version>-automodpack.tzst`. Mods, resource packs and shader packs are copied from the `--jars` folders, matched by sha1; `build.sh` passes `$AUTOMODPACK_JARS`. If anything is missing, the folder is still written for inspection but the archive isn't, so an incomplete bundle can't be deployed.

`tfct.json` says what differs from the export:

- `clientOnly`: packwiz slugs (the `mods/<slug>.pw.toml` name) of mods that players get but the server doesn't load
- `notShipped`: packwiz slugs left out entirely; voxy is shared on Discord instead
- `serverMods`: server-only jars, either committed under `server-mods/` (`source`) or found in `--jars` by `sha1`
- `builtPacks`: shader packs built from another pack with some files replaced. `photon_v1.3b-fix.zip` is `photon_v1.3b.zip` with the `shaders.properties` and `settings.glsl` from `config/global_shaderpack_properties/photon_v1.3b-fix/`. Global Shaderpack Properties applies the `.properties` file at runtime, but not the `.glsl` one, so the pack itself has to be rebuilt.

`automodpack-server.json` is the host config the bundle installs.

## Compare

```bash
python3 tools/automodpack/automodpack.py compare TFCT-3.0.14.zip tfct-automodpack-mods-101526.tzst
python3 tools/automodpack/automodpack.py compare TFCT-3.0.14.zip SERVER --client "automodpack/modpacks/TFC Tuesday 2026"
```

`SERVER` is a server snapshot holding `automodpack/` and `mods/` (and `kubejs/`, if you have it), either a folder or a `.tzst`. It reports, against what the build would produce:

- what players are sent (the server's `automodpack-content.json`)
- built shader packs whose replaced files don't match the repo
- the mods the server loads, and its `kubejs/` when the snapshot has one
- `automodpack-server.json` against the template here
- leftover packwiz metadata in the server's `mods/.index`

`--client` also checks a player's downloaded copy against the server's list. The exit status is 1 when anything differs.

## Snapshots

Server and client snapshots contain secrets: `automodpack/.private/` holds the server's TLS key, or a player's connection secret. `.gitignore` and `.packwizignore` exclude `/automodpack/` and `*.tzst`, and `compare` unpacks archives without `.private`. To look inside a snapshot yourself:

```bash
tar --zstd -tvf snapshot.tzst | less                                  # list
mkdir -p /tmp/snap && tar --zstd -xf snapshot.tzst -C /tmp/snap --exclude=.private
tar --zstd -xOf snapshot.tzst automodpack/automodpack-server.json     # one file to stdout
```
