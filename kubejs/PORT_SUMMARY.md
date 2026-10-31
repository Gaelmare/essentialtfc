# Pigvil 1.21.1 Port Summary

## Goal

Port the TerraFirmaThings Pigvil to a KubeJS-TFC 1.21.1 pack without a Java mod. The Pigvil is a mob that you move around and settle down as an anvil, not an item you carry.

- Phase 1 (done, tested): pigs become Pigvil anvil blocks, and carrots upgrade the blocks through the tiers.
- Phase 2 (done, tested, shipped in 3.0.14): the original walking Pigvil mob, built with EntityJS. Pigs now turn into the mob, and the anvil block is only the Pigvil's settled form.

## Phase 1: items, blocks, recipes

### Items (`startup_scripts/pigvil_startup.js`)

| ID | Name | Forged from | Anvil tier |
| --- | --- | --- | --- |
| `kubejs:pigiron_carrot` | Pig Iron Carrot | `tfc:metal/ingot/pig_iron` | 3 |
| `kubejs:black_steel_carrot` | Black Steel Carrot | `tfc:metal/ingot/black_steel` | 5 |
| `kubejs:blue_steel_carrot` | Blue Steel Carrot | `tfc:metal/ingot/blue_steel` | 6 |
| `kubejs:red_steel_carrot` | Red Steel Carrot | `tfc:metal/ingot/red_steel` | 6 |

The anvil recipes (`server_scripts/pigvil_server.js`) use the same steps as the original mod: punch last, hit not last, bend not last.

### Blocks (`startup_scripts/pigvil_startup.js`)

All five are registered with the KubeJS-TFC `tfc:anvil` builder, tagged `minecraft:mineable/pickaxe`, and set to `.noDrops()`. Breaking one spawns the matching Pigvil entity instead.

| Block | Anvil tier | Entity |
| --- | --- | --- |
| `kubejs:pigvil_steel` | 4 | `kubejs:pigvil` |
| `kubejs:pigvil_black` | 5 | `kubejs:pigvil_black` |
| `kubejs:pigvil_blue` | 6 | `kubejs:pigvil_blue` |
| `kubejs:pigvil_red` | 6 | `kubejs:pigvil_red` |
| `kubejs:pigvil_purple` | 6 | `kubejs:pigvil_purple` |

The `curios:back` and `tfc:minecart_holdable` tags were removed when the Pigvil became a mob. Block names now come from `assets/kubejs/lang/en_us.json`.

### Anvil-block upgrades (removed)

Carrots no longer upgrade a placed Pigvil anvil. Upgrades only happen on the walking Pigvil (see Phase 2).

### Item sizes (`server_scripts/pigvil_server.js`)

Carrots are small/medium; Pigvil blocks are huge/very heavy.

## Phase 2: the Pigvil entity

### Dependencies

- **EntityJS:** written against 1.5.2 (branch `EntityJS-1.21-neo`). Check the builder method names against the version in the pack.
- **GeckoLib 4.x:** required by EntityJS.
- Both are needed on client and server.
- **KubeJS-TFC's EntityJS compat is not used.** It isn't included in KubeJS-TFC 1.21.1, and isn't needed: the original Pigvil was a plain vanilla-style mob, not a TFC animal.

### Files

| File | Contents |
| --- | --- |
| `startup_scripts/pigvil_entity_data.js` | `global.PIGVIL`: tier table (entity ↔ block ↔ texture), upgrade map, follow items, conversion chance, familiarity. Has `// priority: 100` so it loads before the other startup scripts |
| `startup_scripts/pigvil_entity_startup.js` | Entity types, attributes, model and animation hookup, sounds, damage immunity, player-squash damage, right-click → anvil |
| `server_scripts/pigvil_entity_server.js` | AI goals, pig → Pigvil conversion, carrot upgrades on the entity, anvil break → Pigvil, oink on anvil use |
| `assets/kubejs/geo/entity/pigvil.geo.json` | GeckoLib model |
| `assets/kubejs/animations/entity/pigvil.animation.json` | `animation.pigvil.walk` |
| `assets/kubejs/lang/en_us.json` | Entity, spawn egg and block names |

Script files of the same type share one scope, so every top-level name in the new files is distinct from those in `pigvil_startup.js` and `pigvil_server.js`.

### Original behaviour → port

| Original (`EntityPigvil`, `ItemPigIronCarrot`, `BlockPigvil`) | Port |
| --- | --- |
| Plain vanilla-style mob, 0.9×0.9, 50 max health, 0.1 movement speed | `entityjs:mob`, `.sized(0.9, 0.9)`, `EntityJSEvents.attributes` |
| AI goals: panic (0), follow when holding pig iron or a carrot (4), wander avoiding water (6), watch player (7), look around (8) | `EntityJSEvents.addGoalSelectors` with the same priorities and speeds |
| Only takes damage from the void, lava, fire and drowning | `.isInvulnerableTo`; also allows `/kill` (generic kill damage in 1.21) |
| Pig sounds; anvil-land fall sound | `setAmbientSound` / `setHurtSound` / `setDeathSound` / `fallSounds` |
| Never despawns | `.isPersistenceRequired(true)` |
| Falling more than 3 blocks onto a player deals fall distance × 3 damage | `.playerTouch`, using vanilla falling-anvil damage ("squashed by a falling anvil") |
| Right-click turns it into its anvil, facing its heading, if the space is replaceable | `.onInteract`. Changed: only with an **empty hand** and not sneaking, so carrots, leads and name tags work normally |
| Breaking the anvil spawns a Pigvil, no item; creative breaks just remove it | `BlockEvents.broken` + `.noDrops()` |
| Right-clicking the anvil oinks | `BlockEvents.rightClicked`, not cancelled |
| Pig iron carrot fed to a pig makes a Pigvil | Moved from `pigvil_server.js`; now spawns `kubejs:pigvil` instead of placing a block. Same checks as before, plus it now runs only on the server |
| Steel carrots upgrade the Pigvil, each with the conversion chance | `ItemEvents.rightClicked` on the Pigvil. The new tier keeps position, heading, health, custom name and lead |
| Tier stored in synced entity data | One entity type per tier; the texture is chosen per type |
| Spawn egg | Base Pigvil only, with the original colours (`0xF1AAAA` / `0x555555`). EntityJS gives the egg the entity's ID, so the item is `kubejs:pigvil` and its name is `item.kubejs.pigvil` in the lang file |

### Facing

TFC 1.21 anvils have a `facing` property. The unrotated Pigvil block model has its head pointing east, and KubeJS-TFC uses it unrotated for `facing=west` and rotates it clockwise for the others (`north` 90°, `east` 180°, `south` 270°). So the head always points **opposite** `facing`, and the scripts convert as follows:

- Pigvil → anvil: `facing` = the opposite of the Pigvil's heading. The heading comes from the body yaw, which is what's rendered.
- Anvil → Pigvil: heading = the opposite of `facing`.

### Model

`pigvil.geo.json` was converted by hand from `ModelPigvil` (64×32 texture, standard box UVs):

- head
- snout, with two tusks tilted 15°
- body
- four legs

The vanilla 4×3×1 pig nose is left out because the Pigvil snout completely encloses it, and their shared faces would flicker.

The walk animation swings diagonal leg pairs ±30° once per second. It plays only while the Pigvil is moving.

EntityJS does not turn a GeckoLib `head` bone automatically, so the head stays fixed to the body. The body still turns toward whatever the Pigvil is looking at.

### KubeJS method renames

KubeJS mixins rename or hide some vanilla methods for scripts (`@RemapForJS` / `@HideFromJS`), so the Mojang name fails with "Cannot find function". The ones these scripts use:

| Mojang name | Name in scripts |
| --- | --- |
| `Entity.getYRot()` / `setYRot()` | `getYaw()` / `setYaw()` |
| `Entity.setYBodyRot()` | `setBodyYaw()` |
| `Entity.moveTo(x, y, z, yaw, pitch)` | `setPositionAndRotation()` |
| `Entity.hurt(source, amount)` | hidden; use `attack(source, amount)` |
| `DamageSource.getMsgId()` | `getType()` |
| `DamageSource.getEntity()` / `getDirectEntity()` | `getActual()` / `getImmediate()` |

The full list is in `dev/latvian/mods/kubejs/core/mixin/EntityMixin` (and `DamageSourceMixin`, etc.) in the KubeJS jar.

### Test checklist

- [x] Pack loads with EntityJS + GeckoLib; no errors in `logs/kubejs/startup.log` or `server.log`
- [x] Pigvils render with the right texture per tier; the walk animation plays; tusks and snout are in the right place
- [x] Pig → Pigvil conversion (male, adult, not old, ≥ 35% familiarity, 25% chance)
- [x] Each upgrade branch on the entity; health, name and lead carry over
- [x] Empty-hand right-click → anvil, facing the way the Pigvil was walking; the anvil works at its tier
- [x] Breaking the anvil in survival → Pigvil facing the same way, no item drop; in creative → block removed
- [x] Anvil oinks when used, and the anvil screen still opens
- [x] Immune to player attacks and falls; dies in lava, the void and to `/kill`
- [x] Falling more than 3 blocks onto a player hurts them
- [x] Follows a player holding pig iron or a carrot; can be led
- [x] Survives save/reload and chunk unload; never despawns
- [x] Works on a dedicated server

### Known gaps

- **Sounds and particles use commands.** Like the Phase 1 code, sounds are played through `execute … run playsound` (and the spawn puff through `particle`), so they show up as server commands rather than direct sound events.
- **Names are lost through an anvil.** A Pigvil that becomes an anvil and back loses its custom name and returns to full health. The block doesn't store either.
- **Non-player removal loses the Pigvil.** An anvil destroyed by an explosion, or removed some other way without a player breaking it, is lost: it drops nothing and spawns no Pigvil.
- **Possibly unused textures.** The single-image block textures (`textures/block/pigvil_{steel,black,…}.png`) passed to `.texture()` are probably only used for particles or as a fallback.
