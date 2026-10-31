# Pigvil port for KubeJS-TFC 1.21.1

A KubeJS + KubeJS-TFC + EntityJS port of the TerraFirmaThings Pigvil: a pig that eats metal carrots and becomes a walking anvil. You lead it where you need it, right-click it to settle it down as a working TFC anvil, and break the anvil to wake it up again.

## Requirements

- Minecraft 1.21.1 / NeoForge
- KubeJS
- KubeJS-TFC (and TerraFirmaCraft)
- EntityJS (written against 1.5.2)
- GeckoLib 4.x (required by EntityJS)

All of these are needed on both client and server.

## Contents

| Path | Purpose |
| --- | --- |
| `startup_scripts/pigvil_startup.js` | Registers the four carrot items and the five Pigvil anvil blocks |
| `startup_scripts/pigvil_entity_data.js` | Shared tier, upgrade and tuning data (`global.PIGVIL`) |
| `startup_scripts/pigvil_entity_startup.js` | Registers the five Pigvil entity types and their behaviour |
| `server_scripts/pigvil_server.js` | Carrot anvil recipes, TFC item sizes |
| `server_scripts/pigvil_entity_server.js` | AI goals, pig → Pigvil conversion, Pigvil upgrades, anvil ↔ Pigvil |
| `assets/kubejs/geo/entity/pigvil.geo.json` | GeckoLib model, converted from the original `ModelPigvil` |
| `assets/kubejs/animations/entity/pigvil.animation.json` | Walk animation |
| `assets/kubejs/lang/en_us.json` | Entity, spawn egg and anvil names |
| `assets/kubejs/models/`, `textures/` | Block, item and entity art extracted from the original mod |

## Gameplay

1. Forge a carrot on a TFC anvil from an ingot: pig iron (tier 3), black steel (tier 5), blue steel or red steel (tier 6).
2. Right-click an adult male `tfc:pig` that isn't old and has at least 35% familiarity with a **pig iron carrot**. The carrot is eaten (unless you are in creative), and there is a 25% chance the pig turns into a **Pigvil**.
3. Feed a Pigvil steel carrots to upgrade it. Each carrot has a 25% chance to work:
   - Pigvil → black (black steel carrot)
   - black → blue (blue steel carrot) or red (red steel carrot)
   - blue → purple (red steel carrot)
   - red → purple (blue steel carrot)
4. Moving a Pigvil:
   - Pigvils are slow, follow players holding pig iron or any Pigvil carrot, and can be led with a lead.
   - They never despawn.
   - Nothing hurts them except the void, `/kill`, lava, fire and drowning.
   - A Pigvil that falls more than 3 blocks onto a player hurts them.
5. Right-click a Pigvil with an empty hand to settle it into an anvil of its tier, facing the way it was walking.
   - Pigvil (base tier) = tier 4.
   - Black = tier 5.
   - Blue, red and purple = tier 6.
6. Break the anvil to get the walking Pigvil back. The anvil never drops as an item. In creative mode, breaking it simply removes it.

## Status

Tested in-game, single player and on a dedicated server, and shipped in VitalTFC 3.0.14. Carrots upgrade only the walking Pigvil, not a placed anvil. See [PORT_SUMMARY.md](PORT_SUMMARY.md) for the test checklist and known gaps.
