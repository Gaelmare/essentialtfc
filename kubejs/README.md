# Pigvil port scaffold for KubeJS-TFC 1.21.1

This directory contains a smaller, block-based Pigvil port built from the original mod’s assets and behavior structure.

What is included:
- extracted Pigvil textures and model JSONs under kubejs/assets/kubejs/
- item registration for the Pig Iron / Black Steel / Blue Steel / Red Steel carrot variants
- TFC anvil registration for the Pigvil anvils using the KubeJS-TFC `tfc:anvil` builder
- a progression scaffold that upgrades anvils on right click using carrots
- recipe examples for crafting the base and tiered anvils

Notes:
- This does not recreate the original Java custom mob/AI Pigvil entity.
- It is the realistic KubeJS/TFC version of the feature: custom anvil blocks + carrot-driven progression + extracted art.
- The exact recipe/event hooks may still need minor tuning to match the specific KubeJS-TFC version in the target pack.
