// Pigvil entities, ported from the original EntityPigvil. Requires EntityJS and GeckoLib.
// Every tier in global.PIGVIL.tiers gets its own entity type, all sharing one
// model and animation; only the texture differs.
// Goals, conversion, upgrades and block -> entity live in server_scripts/pigvil_entity_server.js.

// Damage (by message id) that can still hurt a Pigvil: the void, /kill, lava, fire and drowning.
const PIGVIL_VULNERABLE_TO = ['outOfWorld', 'genericKill', 'lava', 'inFire', 'drown'];

// Horizontal headings in yaw order: yaw 0 = south, 90 = west, 180 = north, 270 = east.
const PIGVIL_YAW_HEADINGS = ['south', 'west', 'north', 'east'];

// The anvil model's head points opposite the block's `facing`,
// so a Pigvil heading north becomes an anvil with facing=south.
const PIGVIL_FACING_FOR_HEADING = { north: 'south', south: 'north', east: 'west', west: 'east' };

// Limb swing amount above which the walk animation plays. GeckoLib's isMoving() needs
// about 0.03 blocks/tick, faster than a 0.1-speed Pigvil walks, so it almost never fires.
// Walking Pigvils swing at roughly 0.06-0.09; standing still decays to 0.
const PIGVIL_WALK_THRESHOLD = 0.02;


const pigvilEntitySound = (entity, sound) => {
    const server = entity.server;
    if (!server) return;

    server.runCommandSilent(
        'execute in ' + entity.level.dimension + ' positioned ' + entity.x + ' ' + entity.y + ' ' + entity.z +
        ' run playsound ' + sound + ' neutral @a[distance=..16]'
    );
};

// Right-click with an empty hand: settle down into an anvil block facing the way the Pigvil was heading.
const pigvilToAnvil = ctx => {
    const entity = ctx.entity;
    const player = ctx.player;

    // onInteract runs on both sides and for both hands.
    if (entity.level.isClientSide() || String(ctx.hand) !== 'MAIN_HAND') return;
    if (player.isShiftKeyDown() || !player.getItemInHand(ctx.hand).isEmpty()) return;

    const tier = global.PIGVIL.tiers.find(t => t.entity === String(entity.type));
    if (!tier) return;

    const pos = entity.blockPosition();
    if (!entity.level.getBlockState(pos).canBeReplaced()) return;

    // Body yaw is what's rendered; plain yaw lags behind it while the Pigvil stands still.
    const yaw = ((entity.getBodyYaw() % 360) + 360) % 360;
    const heading = PIGVIL_YAW_HEADINGS[Math.floor((yaw + 45) / 90) % 4];

    entity.level.getBlock(pos).set(tier.block, { facing: PIGVIL_FACING_FOR_HEADING[heading] });
    pigvilEntitySound(entity, 'minecraft:block.anvil.place');
    entity.discard();

    if (typeof player.swing === 'function') {
        player.swing();
    }
};

// Falling onto a player hurts them, scaled by how far the Pigvil fell.
const pigvilLandOnPlayer = ctx => {
    const entity = ctx.entity;
    const player = ctx.player;

    if (entity.level.isClientSide()) return;
    if (entity.fallDistance <= 3 || entity.y <= player.y) return;

    player.attack(entity.damageSources().anvil(entity), entity.fallDistance * 3);
};


StartupEvents.registry('entity_type', event => {
    global.PIGVIL.tiers.forEach((tier, index) => {
        const builder = event.create(tier.entity.split(':')[1], 'entityjs:mob');

        builder.mobCategory('creature');
        builder.sized(0.9, 0.9);
        builder.isPersistenceRequired(true);

        builder.setRenderType('cutout');
        builder.modelResource(() => 'kubejs:geo/entity/pigvil.geo.json');
        builder.animationResource(() => 'kubejs:animations/entity/pigvil.animation.json');
        builder.textureResource(() => tier.texture);
        builder.addAnimationController('movement', 5, e => {
            if (e.getLimbSwingAmount() < PIGVIL_WALK_THRESHOLD) return false;
            e.thenLoop('animation.pigvil.walk');
            return true;
        });

        builder.setAmbientSound('minecraft:entity.pig.ambient');
        builder.setHurtSound(() => 'minecraft:entity.pig.hurt');
        builder.setDeathSound('minecraft:entity.pig.death');
        builder.fallSounds('minecraft:block.anvil.land', 'minecraft:block.anvil.land');

        builder.isInvulnerableTo(ctx => PIGVIL_VULNERABLE_TO.indexOf(String(ctx.damageSource.getType())) === -1);
        builder.playerTouch(ctx => pigvilLandOnPlayer(ctx));
        builder.onInteract(ctx => pigvilToAnvil(ctx));

        // Only the base Pigvil gets a spawn egg, with the original mod's colours.
        if (index === 0) {
            builder.eggItem(egg => egg.backgroundColor(0xF1AAAA).highlightColor(0x555555));
        } else {
            builder.noEggItem();
        }
    });
});

EntityJSEvents.attributes(event => {
    global.PIGVIL.tiers.forEach(tier => {
        event.modify(tier.entity, attributes => {
            attributes.add('minecraft:generic.max_health', 50);
            attributes.add('minecraft:generic.movement_speed', 0.1);
        });
    });
});
