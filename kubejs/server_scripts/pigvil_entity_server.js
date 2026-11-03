// Pigvil entity behaviour: AI goals, pig -> Pigvil conversion, carrot upgrades,
// and breaking a Pigvil anvil to get the walking Pigvil back.
// Entity types are registered in startup_scripts/pigvil_entity_startup.js; shared data is global.PIGVIL.

// Yaw for each horizontal heading (yaw 0 = south).
const PIGVIL_HEADING_YAW = { south: 0, west: 90, north: 180, east: 270 };

// The anvil model's head points opposite the block's `facing`.
const PIGVIL_HEADING_FOR_FACING = { north: 'south', south: 'north', east: 'west', west: 'east' };


const pigvilRunAt = (level, x, y, z, command) => {
    if (!level.server) return;
    level.server.runCommandSilent('execute in ' + level.dimension + ' positioned ' + x + ' ' + y + ' ' + z + ' run ' + command);
};

const pigvilSound = (level, x, y, z, sound) => {
    pigvilRunAt(level, x, y, z, 'playsound ' + sound + ' neutral @a[distance=..16]');
};

const pigvilTierForBlock = id => global.PIGVIL.tiers.find(t => t.block === id);

const pigvilClickedEntity = event => {
    const target = event.target;
    return target && target.entity ? target.entity : null;
};

// Spawns a Pigvil of the given type, facing `yaw`, with a puff of smoke.
const spawnPigvil = (level, entityId, x, y, z, yaw) => {
    const pigvil = level.createEntity(entityId);
    if (!pigvil) return null;

    pigvil.setPositionAndRotation(x, y, z, yaw, 0);
    pigvil.setYHeadRot(yaw);
    pigvil.setBodyYaw(yaw);
    pigvil.spawn();

    pigvilRunAt(level, x, y, z, 'particle minecraft:poof ~ ~0.5 ~ 0.3 0.3 0.3 0.05 20');
    return pigvil;
};

const consumeOne = (player, stack) => {
    if (!player.isCreative()) {
        stack.count = Math.max(0, stack.count - 1);
    }
};

const isValidPigvilTarget = entity => {
    const isMale = entity.getGender().isMale();
    const isAdult = Number(entity.getAge()) >= 0;
    const familiarityNumber = Math.round(Number(entity.getFamiliarity()) * 100);
    const isFamiliarEnough = familiarityNumber >= Math.round(global.PIGVIL.familiarity * 100);
    const hasRequiredOldTick = entity.getOldTick() === -1;

    return isMale && isAdult && isFamiliarEnough && hasRequiredOldTick;
};


global.PIGVIL.tiers.forEach(tier => {
    EntityJSEvents.addGoalSelectors(tier.entity, event => {
        const Player = Java.loadClass('net.minecraft.world.entity.player.Player');

        event.panic(0, 1.25);
        event.tempt(4, 1.2, Ingredient.of(global.PIGVIL.temptItems), false);
        event.waterAvoidingRandomStroll(6, 1.0, 0.001);
        event.lookAtEntity(7, Player, 6, 0.02, false);
        event.randomLookAround(8);
    });
});


// Pig iron carrot + tame adult male pig -> chance of a Pigvil.
ItemEvents.rightClicked(event => {
    if (event.level.isClientSide()) return;

    const pig = pigvilClickedEntity(event);
    const heldItem = event.item;
    const player = event.player;

    if (!pig || String(pig.type) !== 'tfc:pig') return;
    if (!heldItem || heldItem.isEmpty() || String(heldItem.id) !== global.PIGVIL.baseCarrot) return;
    if (!isValidPigvilTarget(pig)) return;

    consumeOne(player, heldItem);
    pigvilSound(event.level, pig.x, pig.y, pig.z, 'minecraft:entity.player.burp');

    if (Math.random() < global.PIGVIL.convertChance) {
        spawnPigvil(event.level, global.PIGVIL.tiers[0].entity, pig.x, pig.y, pig.z, pig.getYaw());
        pigvilSound(event.level, pig.x, pig.y, pig.z, 'minecraft:entity.pig.ambient');
        pig.discard();
    }

    if (typeof player.swing === 'function') {
        player.swing();
    }

    event.cancel();
});


// Steel carrot + Pigvil -> chance of the next tier. The new Pigvil keeps the old one's
// spot, heading, health, name and lead.
ItemEvents.rightClicked(event => {
    if (event.level.isClientSide()) return;

    const pigvil = pigvilClickedEntity(event);
    const heldItem = event.item;
    const player = event.player;

    if (!pigvil || !heldItem || heldItem.isEmpty()) return;

    const options = global.PIGVIL.upgrades[String(pigvil.type)];
    const nextType = options ? options[String(heldItem.id)] : null;
    if (!nextType) return;

    consumeOne(player, heldItem);
    pigvilSound(event.level, pigvil.x, pigvil.y, pigvil.z, 'minecraft:entity.player.burp');

    if (Math.random() < global.PIGVIL.convertChance) {
        const next = spawnPigvil(event.level, nextType, pigvil.x, pigvil.y, pigvil.z, pigvil.getYaw());

        if (next) {
            next.setHealth(pigvil.getHealth());
            if (pigvil.hasCustomName()) {
                next.setCustomName(pigvil.getCustomName());
            }
            if (pigvil.isLeashed()) {
                const holder = pigvil.getLeashHolder();
                pigvil.dropLeash(true, false);
                next.setLeashedTo(holder, true);
            }
            pigvil.discard();
        }
    }

    if (typeof player.swing === 'function') {
        player.swing();
    }

    event.cancel();
});


// Breaking a Pigvil anvil wakes the Pigvil up instead of dropping the block
// (the blocks are registered with noDrops). As in the original, creative
// players just remove the block.
BlockEvents.broken(event => {
    const block = event.block;
    const tier = pigvilTierForBlock(String(block.id));
    if (!tier) return;
    if (event.player && event.player.isCreative()) return;

    const facing = String(block.properties.get('facing'));
    const yaw = PIGVIL_HEADING_YAW[PIGVIL_HEADING_FOR_FACING[facing]] || 0;

    spawnPigvil(event.level, tier.entity, block.x + 0.5, block.y, block.z + 0.5, yaw);
    pigvilSound(event.level, block.x + 0.5, block.y, block.z + 0.5, 'minecraft:entity.pig.ambient');
});


// A Pigvil anvil oinks when used. Not cancelled, so the anvil screen still opens.
BlockEvents.rightClicked(event => {
    if (event.level.isClientSide() || String(event.hand) !== 'MAIN_HAND') return;

    const block = event.block;
    if (!pigvilTierForBlock(String(block.id))) return;

    pigvilSound(event.level, block.x + 0.5, block.y + 0.5, block.z + 0.5, 'minecraft:entity.pig.ambient');
});
