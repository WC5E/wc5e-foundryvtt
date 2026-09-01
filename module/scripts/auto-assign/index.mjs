import { normaliseName } from "./manifest.mjs";

/**
 * Index the spells in the packs the GM ticked.
 *
 * Only the ticked packs are read, so a large collection costs nothing unless
 * it is selected. The first pack in `packIds` order to supply a name wins,
 * which makes the picker's tree order the match-priority order.
 *
 * @param {string[]} packIds
 * @param {object}   options
 * @param {object}   [options.aliases]
 * @param {Function} [options.getPack]   injected for tests
 * @param {Function} [options.onProgress] called with (done, total, packLabel)
 * @returns {Promise<{get: Function, size: number, failed: {packId, error}[]}>}
 */
export async function buildSearchIndex(packIds, {
  aliases = {},
  getPack = id => game.packs.get(id),
  onProgress = null,
} = {}) {
  const map = new Map();
  const failed = [];
  let done = 0;

  for ( const packId of packIds ) {
    const pack = getPack(packId);
    // Every path out of this loop body must reach the `finally`, including the
    // unresolvable-pack one -- a caller driving a progress bar off (done, total)
    // would otherwise stall and never see done === total when a ticked
    // compendium has gone missing since the picker was built.
    let label = packId;
    try {
      if ( !pack ) {
        failed.push({ packId, error: "compendium not found" });
        continue;
      }
      label = pack.metadata?.label ?? packId;
      if ( pack.documentName !== "Item" ) continue;
      const entries = await pack.getIndex({ fields: ["type"] });
      for ( const e of entries ) {
        if ( e.type !== "spell" ) continue;
        const key = normaliseName(e.name, aliases);
        if ( !key || map.has(key) ) continue;   // first pack wins
        map.set(key, {
          uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`,
          name: e.name, packId, packLabel: label,
        });
      }
    }
    catch ( err ) {
      failed.push({ packId, error: err.message ?? String(err) });
    }
    finally {
      done++;
      onProgress?.(done, packIds.length, label);
    }
  }

  return { get: key => map.get(key), size: map.size, failed };
}
