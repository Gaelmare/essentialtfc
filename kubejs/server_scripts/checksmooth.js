// Grants the new advancement: vitaltfc:ian_crushed when a player is hurt or killed by a falling block that was smooth stone at the time of collapse.
// The collapse must have been triggered by chiseling smooth a raw block (tagged #tfc:can_trigger_collapse)
const SMOOTH_TAG = 'c:stones/smooth';
const CHISEL_TAG = 'c:tools/chisel';
const CAN_TRIGGER_COLLAPSE_TAG = 'tfc:can_trigger_collapse';
// uses scoreboard tags on entities to track provenance
const CARRY_TAG = 'vitaltfc:was_smooth_stone';
const CHISEL_TARGET_CARRY_TAG = 'vitaltfc:was_chisel_target';
const ADVANCEMENT = 'vitaltfc:ian_crushed';
const CANDIDATE_TTL_TICKS = 100; // ~5 seconds; drop candidates that never spawned an entity
const DEBUG = false;

// how far out to look for smooth blocks when a chisel triggers a collapse.
//  The actual collapse search radius is larger, but we search this smaller range for performance reasons.
const SCAN_RADIUS_XZ = 10;
const SCAN_RADIUS_DOWN = 3;
const SCAN_RADIUS_UP = 3;

function debug(msg) {
    if (DEBUG) console.log(`[checksmooth] ${msg}`);
}

// hash of pos key -> tick recorded, for positions that were smooth stone right before collapsing
let smoothCandidates = {};

// chiseled targets. These never become smooth stone if they collapse, but still should count
let chiselTargetCandidates = {};

function posKey(x, y, z) {
    return `${x},${y},${z}`;
}

function recordIfSmooth(level, x, y, z, tick) {
    const block = level.getBlock(x, y, z);
    if (block.hasTag(SMOOTH_TAG)) {
        smoothCandidates[posKey(x, y, z)] = tick;
        return true;
    }
    return false;
}

function scanForSmoothAround(level, origin, tick, reason) {
    let found = 0;
    for (let dx = -SCAN_RADIUS_XZ; dx <= SCAN_RADIUS_XZ; dx++) {
        for (let dz = -SCAN_RADIUS_XZ; dz <= SCAN_RADIUS_XZ; dz++) {
            for (let dy = -SCAN_RADIUS_DOWN; dy <= SCAN_RADIUS_UP; dy++) {
                if (recordIfSmooth(level, origin.x + dx, origin.y + dy, origin.z + dz, tick)) {
                    found++;
                }
            }
        }
    }

    debug(`pre-scanned around ${reason} at ${origin.x},${origin.y},${origin.z}, found ${found} smooth candidates`);
}

BlockEvents.rightClicked(event => {
    const heldItem = event.getItem();
    if (!heldItem || heldItem.isEmpty() || !heldItem.getItem().hasTag(CHISEL_TAG)) return;

    const clickedBlock = event.getBlock();
    if (!clickedBlock.hasTag(CAN_TRIGGER_COLLAPSE_TAG)) return;

    const level = clickedBlock.level;
    const tick = level.getServer().tickCount;
    const origin = clickedBlock.pos;

    chiselTargetCandidates[posKey(origin.x, origin.y, origin.z)] = tick;
    debug(`recorded chisel target candidate at ${origin.x},${origin.y},${origin.z}`);

    scanForSmoothAround(level, origin, tick, 'chisel right-click');
});

EntityEvents.spawned(event => {
    const entity = event.getEntity();
    if (entity.getType() !== 'tfc:falling_block') return;

    const key = posKey(Math.floor(entity.getX()), Math.floor(entity.getY()), Math.floor(entity.getZ()));
    const matched = smoothCandidates[key] !== undefined;
    const matchedChiselTarget = chiselTargetCandidates[key] !== undefined;
    debug(`falling_block spawned at key=${key} (raw ${entity.getX()},${entity.getY()},${entity.getZ()}) matched=${matched} matchedChiselTarget=${matchedChiselTarget} knownCandidates=${JSON.stringify(smoothCandidates)}`);

    if (matched) {
        entity.addTag(CARRY_TAG);
        delete smoothCandidates[key];
        debug(`tagged falling_block at ${key} with ${CARRY_TAG}`);
    }

    if (matchedChiselTarget) {
        entity.addTag(CHISEL_TARGET_CARRY_TAG);
        delete chiselTargetCandidates[key];
        debug(`tagged falling_block at ${key} with ${CHISEL_TARGET_CARRY_TAG}`);
    }
});

// Periodically forget candidates that never turned into a falling block entity
// (e.g. the collapse roll failed, or something else claimed that position first)
LevelEvents.tick(event => {
    const server = event.getLevel().getServer();
    if (server.tickCount % 200 !== 0) return;

    const now = server.tickCount;
    Object.keys(smoothCandidates).forEach(key => {
        if (now - smoothCandidates[key] > CANDIDATE_TTL_TICKS) {
            delete smoothCandidates[key];
        }
    });
    Object.keys(chiselTargetCandidates).forEach(key => {
        if (now - chiselTargetCandidates[key] > CANDIDATE_TTL_TICKS) {
            delete chiselTargetCandidates[key];
        }
    });
});

function grantIfSmoothFallingBlockHit(player, source) {
    if (!player || !player.isPlayer()) return;
    if (!source) return;

    // getImmediate() is the entity that directly dealt the damage (the falling block itself),
    // as opposed to getActual(), which would resolve to e.g. a thrower for projectiles.
    const attacker = source.getImmediate();
    debug(`${player.getUsername()} hurt/killed, attacker=${attacker ? attacker.getType() : 'none'}`);
    if (!attacker || attacker.getType() !== 'tfc:falling_block') return;

    const tags = attacker.getTags();
    const hasCarryTag = tags.contains(CARRY_TAG) || tags.contains(CHISEL_TARGET_CARRY_TAG);
    debug(`attacker tags=${tags} hasCarryTag=${hasCarryTag}`);

    if (hasCarryTag) {
        player.getServer().runCommandSilent(`advancement grant ${player.getUsername()} only ${ADVANCEMENT}`);
        debug(`granted ${ADVANCEMENT} to ${player.getUsername()}`);
    }
}

EntityEvents.afterHurt(event => {
    grantIfSmoothFallingBlockHit(event.getEntity(), event.getSource());
});

EntityEvents.death(event => {
    grantIfSmoothFallingBlockHit(event.getEntity(), event.getSource());
});
