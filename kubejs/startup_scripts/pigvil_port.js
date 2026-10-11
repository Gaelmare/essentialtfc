// Pigvil port scaffold for KubeJS-TFC 1.21.1.
// This is intentionally the smaller block/anvil route rather than the original Java mob/AI implementation.

const ITEM_DEFS = {
    pigiron_carrot: { name: 'Pig Iron Carrot', texture: 'kubejs:item/pigiron_carrot' },
    black_steel_carrot: { name: 'Black Steel Carrot', texture: 'kubejs:item/black_steel_carrot' },
    blue_steel_carrot: { name: 'Blue Steel Carrot', texture: 'kubejs:item/blue_steel_carrot' },
    red_steel_carrot: { name: 'Red Steel Carrot', texture: 'kubejs:item/red_steel_carrot' },
};

const BLOCK_DEFS = {
    pigvil_steel: { name: 'Pigvil Steel Anvil', tier: 4, texture: 'kubejs:block/pigvil_steel' },
    pigvil_black: { name: 'Black Steel Pigvil Anvil', tier: 5, texture: 'kubejs:block/pigvil_black' },
    pigvil_blue: { name: 'Blue Steel Pigvil Anvil', tier: 6, texture: 'kubejs:block/pigvil_blue' },
    pigvil_red: { name: 'Red Steel Pigvil Anvil', tier: 6, texture: 'kubejs:block/pigvil_red' },
    pigvil_purple: { name: 'Purple Steel Pigvil Anvil', tier: 6, texture: 'kubejs:block/pigvil_purple' },
};

StartupEvents.registry('item', event => {
    for (const [id, def] of Object.entries(ITEM_DEFS)) {
        event.create(id)
            .displayName(def.name)
            .texture(def.texture);
    }
});

StartupEvents.registry('block', event => {
    for (const [id, def] of Object.entries(BLOCK_DEFS)) {
        event.create(id, 'tfc:anvil')
            .tier(def.tier)
            .texture(def.texture)
            .tag('curios:back')
            .tag('minecraft:mineable/pickaxe')
            .tag('tfc:minecart_holdable');
    }
});

