// Pigvil conversion and progression for KubeJS-TFC 1.21.1.
// This keeps the JS-only port aligned with the original Pigvil art and behavior while
// avoiding the custom Java entity code that is outside the scope of KubeJS.

const PIGVIL_BASE = 'kubejs:pigvil_base';
const PIGVIL_BLACK = 'kubejs:pigvil_black';
const PIGVIL_BLUE = 'kubejs:pigvil_blue';
const PIGVIL_RED = 'kubejs:pigvil_red';
const PIGVIL_PURPLE = 'kubejs:pigvil_purple';

const CARROT_BASE = 'kubejs:pigiron_carrot';
const CARROT_BLACK = 'kubejs:black_steel_carrot';
const CARROT_BLUE = 'kubejs:blue_steel_carrot';
const CARROT_RED = 'kubejs:red_steel_carrot';

function getEntityFromEvent(event) {
    return event.entity || (event.getEntity ? event.getEntity() : null);
}

function getPlayerFromEvent(event) {
    return event.player || (event.getPlayer ? event.getPlayer() : null);
}

function getItemFromEvent(event) {
    return event.item || (event.getItem ? event.getItem() : null);
}

PlayerEvents.rightClickEntity(event => {
    const entity = getEntityFromEvent(event);
    const player = getPlayerFromEvent(event);
    const heldItem = getItemFromEvent(event);

    if (!entity || entity.type !== 'minecraft:pig') return;
    if (!heldItem || heldItem.isEmpty() || heldItem.id !== CARROT_BASE) return;

    event.cancel();
    if (player && !player.isCreative()) {
        heldItem.count = Math.max(0, heldItem.count - 1);
    }

    const pos = entity.blockPosition ? entity.blockPosition() : (entity.getBlockPos ? entity.getBlockPos() : null);
    if (!pos) return;

    if (typeof entity.kill === 'function') {
        entity.kill();
    } else {
        entity.remove();
    }

    event.level.setBlock(pos, Block.of(PIGVIL_BASE).defaultBlockState());
    if (player && typeof player.swing === 'function') {
        player.swing();
    }
});

// If your specific KubeJS-TFC build exposes a dedicated TFC anvil recipe type,
// replace the examples above with that API instead of generic shaped recipes.
