# AutoModpack tooling

The TFC Tuesday server hands the pack to players with [AutoModpack](https://modrinth.com/project/automodpack). These tools build the server's `mods/`, `kubejs/` and `automodpack/` folders from the TFCT CurseForge export, and check a deployed server against that export.

Needs Python 3.11+ and GNU tar with zstd.

## Deploying a release

1. Build the TFCT zip and the server bundle. `AUTOMODPACK_JARS` lists folders holding the jars and packs, matched by sha1. An up-to-date VitalTFC instance has the pack's; the TFCTuesday2026 instance has the AutoModpack jar in `mods/` and the operator's extra mods in its modpack folder. `build.sh` uses these folders when `AUTOMODPACK_JARS` isn't set:

   ```bash
   I=$HOME/bin/minecraft-at/instances
   AUTOMODPACK_JARS="$I/VitalTFC/mods:$I/VitalTFC/resourcepacks:$I/VitalTFC/shaderpacks:$I/TFCTuesday2026/mods:$I/TFCTuesday2026/automodpack/modpacks/TFC Tuesday 2026/mods" ./build.sh
   ```

   If it lists missing files, add the folder that has them and rerun; the archive is only written when nothing is missing.
2. Send `.out/automodpack/TFCT-<version>-automodpack.tzst` to the server operator. Its `DEPLOY.md` has the steps: stop the server, delete `mods/`, `kubejs/` and `automodpack/host-modpack/`, extract the archive into the server folder, start the server. `automodpack/.private/` stays untouched.
3. After the server has restarted, get a new snapshot of its `automodpack/` and `mods/` and check it:

   ```bash
   python3 tools/automodpack/automodpack.py compare TFCT-<version>.zip <snapshot>.tzst
   ```

## Background (October 2026)

This tooling came out of comparing the 3.0.14 server (snapshot `tfct-automodpack-mods-101526.tzst`, 2026-10-15) with `TFCT-3.0.14.zip`. The server had drifted from the pack, so the bundle now replaces the server's `mods/`, `kubejs/` and host-modpack wholesale instead of editing them by hand. What was found, and what was decided:

- **Server scripts go to players.** The operator had copied `kubejs/server_scripts` into `host-modpack/main/` by hand, which AutoModpack sends without filtering. That's intended: players need them for single player, and CurseForge players get them anyway. The build now puts the pack's whole `kubejs/` in host-modpack, so there's no hand-copied set to drift. (The template's old `!/kubejs/server_scripts/**` rule only filtered the server folder, which is no longer synced.)
- **Stray kubejs files.** The server's `kubejs/` had a second copy of the pigvil assets one level too high (`kubejs/textures`, `kubejs/models` and so on), plus KubeJS's example `main.js`, all sent to players through `/kubejs/**`. The host config no longer syncs `mods/` or `kubejs/` from the server folder, and deploying replaces `kubejs/`.
- **Stale packwiz index.** The server's `mods/.index` held packwiz metadata from an early 3.0.x release (TFC 4.2.9, for example). Nothing reads it, but packwiz-installer would have downgraded mods. Deploying replaces `mods/` without it.
- **Default Options.** The server still had the Default Options mod (and Balm, which only it needs) and their configs from 3.0.4. The pack replaced them in 3.0.7 with `kubejs/config/defaultoptions.txt`. Both are dropped.
- **Operator-added mods are kept.** These are in `extraMods`, sent to players as before. Players and the server get: spark, observable (which needs architectury and kotlinforforge), chunksending, chunksmith, ContentCreatorIntegration (which needs iChunUtil), gsu and Pehkui. Players only get blackearlyloading. The CCI configs are in `host/config/contentcreatorintegration/`; their token fields are empty, so keep real tokens out of the repo.
- **`config/xaerominimap.txt` is obsolete.** Xaero's Minimap 26.x only renames it to `config/xaerohud.txt`, once, if that doesn't exist yet. Its settings now live in `config/xaero/minimap/`, seeded from `defaultconfigs/xaero/minimap/`, which the pack ships (since `3a8a58e`). The operator's copy is dropped.
- **kubejs_tfc** was 2.0.2 on the server against 2.1.0 in the pack; the bundle ships the pack's version.
- **voxy** is synced as before, with its force-copy rule (`forceCopyFilesToStandardLocation`) to put it in players' standard `mods/`. `build.sh` drops it from the TFCT zip for size, so the bundle adds it as a `client` entry in `extraMods`.
- **AutoModpack** goes in the server's `mods/` only. Players get it from the seed modpack they install, which AutoModpack then syncs into.
- **gogetem** is darkphan's own server-only mod (MIT), committed under `server-mods/`.
- **Photon fix.** The bundle used to also send players `photon_v1.3b-fix.zip`, built from `photon_v1.3b.zip` with the `.properties` and `settings.glsl` files from `config/global_shaderpack_properties/photon_v1.3b-fix/`. It was dropped in November 2026; players get only Photon 1.4, from the export.

Open questions:

- **lithium.properties and fallingtree.json don't work from `defaultconfigs/`.** `3a8a58e` (2026-09-26) moved them there from `config/`, together with `simplebackups-common.toml`, but only NeoForge's own configs are seeded from `defaultconfigs/`. NeoForge copies `defaultconfigs/<file>` the first time a NeoForge config of any type is created; `simplebackups-common.toml` is one, so it can stay. Lithium and FallingTree read only `config/lithium.properties` and `config/fallingtree.json`, so since that commit neither reaches CurseForge players: Lithium's `collisions.empty_space` setting is off for them, and FallingTree runs with its defaults instead of the saw-only rule. The operator sent the pre-move copies to TFCT players under `config/`; the bundle doesn't. Moving those two back to `config/` fixes both.
- **The server's own `config/`** is not part of the bundle, so the server keeps whatever FallingTree, Lithium and CCI settings it has now.
- The pack's packwiz metadata marks the client-only mods in `clientOnly` as `side = "both"`. Marking them `client` would let the tool drop that list.

## How the server is laid out

AutoModpack sends players everything in `automodpack/host-modpack/main/`, plus any files in the server folder that match `syncedFiles` in `automodpack-server.json`. The build fills host-modpack with exactly what players need, and the template syncs nothing else from the server folder. So:

- players get the export's files, including `kubejs/server_scripts` for single player, minus server-only mods
- the server's `mods/` holds the pack's server-side mods plus the `extraMods` in `tfct.json` whose side is `server` or `both`. AutoModpack and gogetem are `server`, so the sync never sends them; players already have AutoModpack from the seed modpack
- the server's `kubejs/` is the export's `kubejs/`, including `server_scripts`

## Build

`build.sh` runs this after it makes `TFCT-<version>.zip`:

```bash
python3 tools/automodpack/automodpack.py build TFCT-3.0.14.zip --jars ~/instance/mods:~/instance/resourcepacks:~/instance/shaderpacks
```

It writes `.out/automodpack/TFCT-<version>/`, holding `automodpack/`, `mods/`, `kubejs/` and `DEPLOY.md` (how to install it on the server), then archives it as `.out/automodpack/TFCT-<version>-automodpack.tzst`. Mods, resource packs and shader packs are copied from the `--jars` folders, matched by sha1; `build.sh` passes `$AUTOMODPACK_JARS`. If anything is missing, the folder is still written for inspection but the archive isn't, so an incomplete bundle can't be deployed.

`tfct.json` says what differs from the export:

- `clientOnly`: packwiz slugs (the `mods/<slug>.pw.toml` name) of mods that players get but the server doesn't load
- `notShipped`: packwiz slugs left out entirely. vss (Voxy Server Side) is left out because the server uses chunksmith, an `extraMods` entry, for the same job; the CurseForge pack ships vss only because chunksmith can't be shipped there yet
- `extraMods`: mods that aren't in the TFCT export, with a `side`: the operator's extra mods, and voxy, which `build.sh` removes from the zip. Update voxy's `file` and `sha1` here when the pack updates it; the build stops if that jar isn't found. `server` mods go only in the server's `mods/`, `client` mods only to players, and `both` to each. Each jar is either committed under `server-mods/` (`source`) or found in `--jars` by `sha1`
- `hostOverlay`: a folder (`host/`) whose files are sent to players as-is, such as the CCI configs
- `builtPacks`: shader packs built from another pack (`base`, found in `--jars` by `baseSha1`) with some files replaced (`replace` maps a path in the zip to a file in the repo). Global Shaderpack Properties applies `.properties` files at runtime but not `.glsl` ones, so changing those means rebuilding the pack. Currently empty.

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
