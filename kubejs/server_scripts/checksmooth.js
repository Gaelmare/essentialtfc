// Advancement: vitaltfc:ian_crushed
// Grant condition: the player is hurt or killed by a tfc:falling_block entity from a
// chisel-triggered collapse (ChiselItem.useOn, TFC source), where that entity is either
// (a) a block tagged #c:stones/smooth at collapse time, or
// (b) the specific block the chisel was targeting when it triggered the collapse - which is
//     itself still raw (chiseling aborts on collapse, see below), but still counts.
//
// ChiselItem.useOn() calls CollapseRecipe.tryTriggerCollapse(level, pos) directly, from inside the
// item's own interaction code - there's no dedicated event for "collapse triggered by chiseling".
// The only hook available earlier in that call chain is PlayerInteractEvent.RightClickBlock
// (KubeJS: BlockEvents.rightClicked), which vanilla always fires *before* dispatching to
// ItemStack.useOn(). Unlike the block-break path, this isn't a race against another mod's listener:
// TFC doesn't listen to RightClickBlock itself for collapses, it only reacts once useOn() runs, so by
// hooking rightClicked we're guaranteed to see the original, unconverted blocks.
//
// Once we see a right click with a chisel (#c:tools/chisel) on a block tagged
// #tfc:can_trigger_collapse, we proactively scan the surrounding volume for #c:stones/smooth blocks
// (mirroring CollapseRecipe.startCollapse's own search area) and record them as candidates. This is
// necessarily speculative: we don't know yet whether the chisel hit actually rolls a collapse
// (TFCConfig.enableChiselsStartCollapses + the same random chance as mining), so some scans record
// candidates that never end up mattering - they're just cleaned up by the TTL sweep below.
//
// Once a smooth position is known, we carry that fact forward onto the entity itself using a
// scoreboard tag (entity.addTag), which survives safely on the entity - unlike hand-editing the
// full entity NBT, which risks corrupting live falling-block state.

const SMOOTH_TAG = 'c:stones/smooth';
const CHISEL_TAG = 'c:tools/chisel';
const CAN_TRIGGER_COLLAPSE_TAG = 'tfc:can_trigger_collapse';
const CARRY_TAG = 'vitaltfc:was_smooth_stone';
const CHISEL_TARGET_CARRY_TAG = 'vitaltfc:was_chisel_target';
const ADVANCEMENT = 'vitaltfc:ian_crushed';
const CANDIDATE_TTL_TICKS = 100; // ~5 seconds; drop candidates that never spawned an entity
const DEBUG = false;

// How far a chisel-triggered collapse can reach from the chiseled block. It uses the exact same
// CollapseRecipe.tryTriggerCollapse -> startCollapse path as mining does, so the same search area
// applies: worst case ~4 blocks (initial locus search) + collapseMinRadius + collapseRadiusVariance
// (server config, vanilla defaults 3 and 16) horizontally, and roughly +/-8 vertically from that
// locus. These defaults are NOT overridden in this pack's config, so the true worst case is larger
// than what's scanned below. Shrink/grow this to match how far collapses actually reach in practice
// on this server - the wider it is, the more it costs per chisel hit on a collapsible block.
const SCAN_RADIUS_XZ = 10;
const SCAN_RADIUS_DOWN = 6;
const SCAN_RADIUS_UP = 6;

function debug(msg) {
    if (DEBUG) console.log(`[checksmooth] ${msg}`);
}

// pos key -> tick recorded, for positions that were smooth stone right before collapsing
let smoothCandidates = {};

// pos key -> tick recorded, for the specific block a chisel was targeting when it triggered a
// collapse. It's excluded from being the collapse's own "locus" (see tryTriggerCollapse), but can
// still end up swept into startCollapse's wider search and fall itself - and since chiseling aborts
// when a collapse triggers, it's still raw (not #c:stones/smooth) at that point, so it never lands in
// smoothCandidates above. Tracked and tagged separately so it doesn't get conflated with the actual
// "was smooth stone" advancement requirement.
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
