// priority: 100
// Shared Pigvil data for the entity port, read by both the startup and server
// scripts through global.PIGVIL. The priority makes this load before the other
// startup scripts.

global.PIGVIL = {
    // These were config options in the original mod.
    convertChance: 0.25,
    familiarity: 0.35,

    // One entity type per anvil tier. Each Pigvil walks around as `entity` and
    // becomes `block` when placed. The first tier is what a pig turns into.
    tiers: [
        { entity: 'kubejs:pigvil', block: 'kubejs:pigvil_steel', texture: 'kubejs:textures/entity/pigvil.png' },
        { entity: 'kubejs:pigvil_black', block: 'kubejs:pigvil_black', texture: 'kubejs:textures/entity/pigvil_black.png' },
        { entity: 'kubejs:pigvil_blue', block: 'kubejs:pigvil_blue', texture: 'kubejs:textures/entity/pigvil_blue.png' },
        { entity: 'kubejs:pigvil_red', block: 'kubejs:pigvil_red', texture: 'kubejs:textures/entity/pigvil_red.png' },
        { entity: 'kubejs:pigvil_purple', block: 'kubejs:pigvil_purple', texture: 'kubejs:textures/entity/pigvil_purple.png' },
    ],

    // Feeding a Pigvil of the outer type the inner carrot turns it into the inner type.
    upgrades: {
        'kubejs:pigvil': { 'kubejs:black_steel_carrot': 'kubejs:pigvil_black' },
        'kubejs:pigvil_black': {
            'kubejs:blue_steel_carrot': 'kubejs:pigvil_blue',
            'kubejs:red_steel_carrot': 'kubejs:pigvil_red',
        },
        'kubejs:pigvil_blue': { 'kubejs:red_steel_carrot': 'kubejs:pigvil_purple' },
        'kubejs:pigvil_red': { 'kubejs:blue_steel_carrot': 'kubejs:pigvil_purple' },
    },

    baseCarrot: 'kubejs:pigiron_carrot',

    // Pigvils follow players holding any of these.
    temptItems: [
        'tfc:metal/ingot/pig_iron',
        'kubejs:pigiron_carrot',
        'kubejs:black_steel_carrot',
        'kubejs:blue_steel_carrot',
        'kubejs:red_steel_carrot',
    ],
};
