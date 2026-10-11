// Pigvil conversion and progression for KubeJS-TFC 1.21.1.
// This is a JS-only port, using the original Pigvil art and behavior while
// not trying to port the custom Java entity code.

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


const UPGRADE_PATHS = {
    'kubejs:pigvil_steel': [{ item: 'kubejs:black_steel_carrot', next: 'kubejs:pigvil_black' }],
    'kubejs:pigvil_black': [
        { item: 'kubejs:blue_steel_carrot', next: 'kubejs:pigvil_blue' },
        { item: 'kubejs:red_steel_carrot', next: 'kubejs:pigvil_red' }
    ],
    'kubejs:pigvil_blue': [{ item: 'kubejs:red_steel_carrot', next: 'kubejs:pigvil_purple' }],
    'kubejs:pigvil_red': [{ item: 'kubejs:blue_steel_carrot', next: 'kubejs:pigvil_purple' }],
};

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


const playPigAmbientSound = (player, pos) => {
    if (!player || !pos || !player.server || typeof player.server.runCommandSilent !== 'function') return;

    player.server.runCommandSilent(
        'playsound minecraft:entity.pig.ambient ambient @a[x=' + pos.x + ',y=' + pos.y + ',z=' + pos.z + ',distance=..16] ' +
        pos.x + ' ' + pos.y + ' ' + pos.z + ' 1 1'
    );
};


ItemEvents.rightClicked(event => {
    const player = event.player;
    const heldItem = event.item;
    const rawTarget = event.target;
    const targetEntity = rawTarget && rawTarget.entity ? rawTarget.entity : rawTarget;
    const entityType = targetEntity && typeof targetEntity.type === 'string'
        ? targetEntity.type
        : (targetEntity && typeof targetEntity.getType === 'function' ? targetEntity.getType().toString() : null);

    if (!targetEntity || entityType !== 'tfc:pig') return;
    if (!heldItem || heldItem.isEmpty()) return;

    const itemId = heldItem.id && typeof heldItem.id.toString === 'function' ? heldItem.id.toString() : null;
    if (itemId !== CARROT_BASE) return;

    if (player && !player.isCreative()) {
        heldItem.count = Math.max(0, heldItem.count - 1);
    }

    const pos = targetEntity.blockPosition ? targetEntity.blockPosition() : (targetEntity.getBlockPos ? targetEntity.getBlockPos() : null);
    if (!pos) return;


    const pigvilState = Block.getBlock(PIGVIL_STEEL).defaultBlockState();
    event.level.setBlock(pos, pigvilState, 3);

    playPigAmbientSound(player, pos);

    if (typeof targetEntity.discard === 'function') {
        targetEntity.discard();
    } else if (typeof targetEntity.remove === 'function') {
        targetEntity.remove();
    } else if (typeof targetEntity.kill === 'function') {
        targetEntity.kill();
    }

    if (player && typeof player.swing === 'function') {
        player.swing();
    }

    event.cancel();
});


BlockEvents.rightClicked(event => {
    const clickedBlock = event.block;
    const heldItem = event.item;
    const player = event.player;

    if (!clickedBlock) return;

    const blockId = clickedBlock.id.toString();
    if (PIGVIL_BLOCKS.has(blockId)) {
        playPigAmbientSound(player, clickedBlock.pos);
    }

    if (!heldItem || heldItem.isEmpty()) return;

    const itemId = heldItem.id.toString();
    const options = UPGRADE_PATHS[blockId];
    if (!options) return;

    const target = options.find(option => option.item === itemId);
    if (!target) return;

    if (player && !player.isCreative()) {
        heldItem.count = Math.max(0, heldItem.count - 1);
    }

    const nextState = Block.getBlock(target.next).defaultBlockState();
    event.level.setBlock(clickedBlock.pos, nextState, 3);
    if (player && typeof player.swing === 'function') {
        player.swing();
    }

    event.cancel();
});


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