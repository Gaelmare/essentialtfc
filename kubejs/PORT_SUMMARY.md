# Pigvil 1.21.1 Port Summary

## Goal

Create a smaller, practical KubeJS-TFC version of the Pigvil feature for 1.21.1 without re-implementing the original Java entity/AI stack.

This targets the block-based and recipe-driven path, which is realistic for a KubeJS/TFC pack.

## What was extracted from the original mod

The original mod already contains the Pigvil visual assets and item art. These were copied into a KubeJS-compatible asset tree under:

- kubejs/assets/kubejs/models/block/
- kubejs/assets/kubejs/models/item/
- kubejs/assets/kubejs/textures/block/
- kubejs/assets/kubejs/textures/item/
- kubejs/assets/kubejs/textures/entity/

This includes:
- Pigvil block model variants for base / black / blue / red / purple
- Pigvil entity texture variants
- carrot item textures for pig iron, black steel, blue steel, and red steel

## What is implemented so far

### 1) Custom item registration

The startup script registers:
- pigiron_carrot
- black_steel_carrot
- blue_steel_carrot
- red_steel_carrot

These use the extracted textures and item model JSONs.

### 2) TFC anvil registration

The startup script registers custom TFC anvils using the KubeJS-TFC `tfc:anvil` builder for:
- pigvil_steel
- pigvil_black
- pigvil_blue
- pigvil_red
- pigvil_purple

These are intentionally sized and textured as Pigvil variants, following the old mod’s visual design.

### 3) Upgrade progression scaffold

A right-click upgrade hook is included in the startup script. It is designed to:
- detect a Pigvil anvil block
- check the held carrot item
- consume the carrot
- trigger a tier upgrade path

This is the correct compromise for a JS-only port: it supports block-based progression without needing a Java custom entity.

### 4) Recipe scaffolding

A server script includes example shaped recipes for:
- base Pigvil anvil creation
- black / blue / red / purple tier recipe progression

These are intentionally written as a starter template, not as final production recipes, because the exact KubeJS-TFC recipe API can vary by target pack version.

## What is intentionally not included

The original Java behavior is not ported:
- custom Pig entity lifecycle
- Pigvil entity AI
- NBT state for anvil color
- model switching based on custom entity state
- custom item interaction on living pigs

This smaller port targets the block/anvil route rather than the original mob behavior.

## Remaining items

### Required pack-specific tuning

The scripts are intentionally scaffolded, not final pack code. The remaining work is to validate against the actual 1.21.1 pack version:

- exact KubeJS-TFC API for `tfc:anvil`
- exact recipe builder syntax used by the target pack
- exact right-click/block replacement API for replacing the upgraded block
- whether the pack uses `event.block.id` or a different block reference pattern

### Real implementation decisions

Choose one path:

1. Pure KubeJS/TFC block-anvil progression
   - best fit for small port
   - no custom entity behavior

2. Full original Pigvil behavior
   - requires Java mod code
   - not feasible in KubeJS alone

## Validation / testing required

Because the environment lacks a Node runtime, script-level syntax validation could not be completed here. The final validation needs to happen in the target pack environment.

Recommended checks in the real pack:

1. Launch the pack with KubeJS and TFC installed.
2. Confirm all item IDs register correctly.
3. Confirm all anvil block IDs register correctly.
4. Confirm the carrot textures and models appear in-game.
5. Confirm KubeJS-TFC `tfc:anvil` registration succeeds.
6. Confirm recipes produce the expected anvils.
7. Confirm right-click upgrading works on the target block IDs.
8. Test all upgrade branches:
   - base -> black
   - black -> blue / red
   - blue -> purple
   - red -> purple

## Recommended final direction

Proceed with the block-based Pigvil port unless the requirement is to preserve the original live-mob functionality. If the desired result is the original Pigvil as a living entity, Java work is still required.

The current scaffold is a clean baseline for the KubeJS/TFC version and can be refined into pack-specific code once the target KubeJS-TFC API is confirmed.
