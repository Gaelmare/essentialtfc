// Pigvil carrot recipes and item sizes for KubeJS-TFC 1.21.1.
// The walking Pigvil entity, including carrot upgrades, is handled in pigvil_entity_server.js.

const PIGVIL_STEEL = 'kubejs:pigvil_steel';
const PIGVIL_BLACK = 'kubejs:pigvil_black';
const PIGVIL_BLUE = 'kubejs:pigvil_blue';
const PIGVIL_RED = 'kubejs:pigvil_red';
const PIGVIL_PURPLE = 'kubejs:pigvil_purple';

const CARROT_BASE = 'kubejs:pigiron_carrot';
const CARROT_BLACK = 'kubejs:black_steel_carrot';
const CARROT_BLUE = 'kubejs:blue_steel_carrot';
const CARROT_RED = 'kubejs:red_steel_carrot';

const ANVIL_ACTIONS = ['punch_last', 'hit_not_last', 'bend_not_last'];


const tfcAnvilStep = (event, output, input, tier) => {
    event.recipes.tfc
        .anvil(output, input, ANVIL_ACTIONS)
        .tier(tier);
};


ServerEvents.recipes(event => {
    tfcAnvilStep(event, CARROT_BASE, 'tfc:metal/ingot/pig_iron', 3);
    tfcAnvilStep(event, CARROT_BLACK, 'tfc:metal/ingot/black_steel', 5);
    tfcAnvilStep(event, CARROT_BLUE, 'tfc:metal/ingot/blue_steel', 6);
    tfcAnvilStep(event, CARROT_RED, 'tfc:metal/ingot/red_steel', 6);
});


const CARROT_ITEMS = new Set([
    CARROT_BASE,
    CARROT_BLACK,
    CARROT_BLUE,
    CARROT_RED,
]);

const PIGVIL_BLOCKS = new Set([
    PIGVIL_STEEL,
    PIGVIL_BLACK,
    PIGVIL_BLUE,
    PIGVIL_RED,
    PIGVIL_PURPLE,
]);


TFCEvents.data(event => {
    for (const carrot of CARROT_ITEMS) {
        event.itemSize({
            ingredient: carrot,
            weight: 'medium',
            size: 'small'
        });
    }

    for (const pigvil of PIGVIL_BLOCKS) {
        event.itemSize({
            ingredient: pigvil,
            weight: 'very_heavy',
            size: 'huge'
        });
    }
});