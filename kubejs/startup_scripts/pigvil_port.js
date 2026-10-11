// Pigvil port scaffold for KubeJS-TFC 1.21.1.
// This is intentionally the smaller block/anvil route rather than the original Java mob/AI implementation.

const ITEM_DEFS = {
    pigiron_carrot: { name: 'Pig Iron Carrot', texture: 'kubejs:item/pigiron_carrot' },
    black_steel_carrot: { name: 'Black Steel Carrot', texture: 'kubejs:item/black_steel_carrot' },
    blue_steel_carrot: { name: 'Blue Steel Carrot', texture: 'kubejs:item/blue_steel_carrot' },
    red_steel_carrot: { name: 'Red Steel Carrot', texture: 'kubejs:item/red_steel_carrot' },
};

const BLOCK_DEFS = {
    pigvil_base: { name: 'Pigvil Anvil', tier: 5, texture: 'kubejs:block/pigvil_base' },
    pigvil_black: { name: 'Black Steel Pigvil Anvil', tier: 6, texture: 'kubejs:block/pigvil_black' },
    pigvil_blue: { name: 'Blue Steel Pigvil Anvil', tier: 7, texture: 'kubejs:block/pigvil_blue' },
    pigvil_red: { name: 'Red Steel Pigvil Anvil', tier: 7, texture: 'kubejs:block/pigvil_red' },
    pigvil_purple: { name: 'Purple Steel Pigvil Anvil', tier: 8, texture: 'kubejs:block/pigvil_purple' },
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
            .texture(def.texture);
    }
});

// Progression system: block right-click upgrades custom Pigvil anvils using carrots instead of the old mob-triggered logic.
const UPGRADE_PATHS = {
    'kubejs:pigvil_base': [{ item: 'kubejs:black_steel_carrot', next: 'kubejs:pigvil_black' }],
    'kubejs:pigvil_black': [
        { item: 'kubejs:blue_steel_carrot', next: 'kubejs:pigvil_blue' },
        { item: 'kubejs:red_steel_carrot', next: 'kubejs:pigvil_red' }
    ],
    'kubejs:pigvil_blue': [{ item: 'kubejs:red_steel_carrot', next: 'kubejs:pigvil_purple' }],
    'kubejs:pigvil_red': [{ item: 'kubejs:blue_steel_carrot', next: 'kubejs:pigvil_purple' }],
};

function getClickedBlock(event) {
    return event.block || (event.getBlock ? event.getBlock() : null);
}

function getHeldItem(event) {
    return event.item || (event.getItem ? event.getItem() : null);
}

BlockEvents.rightClicked(event => {
    const clickedBlock = getClickedBlock(event);
    const heldItem = getHeldItem(event);
    const player = event.player || (event.getPlayer ? event.getPlayer() : null);

    if (!clickedBlock || !heldItem || heldItem.isEmpty()) return;

    const blockId = clickedBlock.id.toString();
    const itemId = heldItem.id.toString();
    const options = UPGRADE_PATHS[blockId];
    if (!options) return;

    const target = options.find(option => option.item === itemId);
    if (!target) return;

    event.cancel();

    if (player && !player.isCreative()) {
        heldItem.count = Math.max(0, heldItem.count - 1);
    }

    const nextState = Block.of(target.next).defaultBlockState();
    event.level.setBlock(clickedBlock.pos, nextState);
    if (player && typeof player.swing === 'function') {
        player.swing();
    }
});
