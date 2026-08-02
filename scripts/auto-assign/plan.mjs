/**
 * Decide every write, and nothing else. Pure so the preview the GM approves is
 * exactly what apply.mjs executes, and so the additive/idempotent guarantee is
 * testable without Foundry.
 */

export const TARGETS = { MONSTERS: "monsters", LISTS: "spellLists" };
export const DESTINATIONS = { BOTH: "both", COMPENDIUM: "compendium", WORLD: "world" };

/** Spell lists live only in the compendium; there is no world-side copy. */
export function listsAvailable(destination) {
  return destination !== DESTINATIONS.WORLD;
}

function wantsScope(destination, scope) {
  if ( destination === DESTINATIONS.BOTH ) return true;
  if ( destination === DESTINATIONS.COMPENDIUM ) return scope === "pack";
  return scope === "world";
}

/**
 * @param {object} manifest      from loadManifest()
 * @param {object} index         from buildSearchIndex()
 * @param {string[]} targets     TARGETS values
 * @param {string} destination   a DESTINATIONS value
 * @param {object} state         {monsters: MonsterState[], lists: ListState[]}
 * @returns {object} plan
 */
export function buildPlan({ manifest, index, targets, destination, state }) {
  const writes = [];
  const notFound = new Map();

  const miss = (spell, who) => {
    const rec = notFound.get(spell.key)
      ?? { name: spell.name, key: spell.key, source: spell.source ?? "", wantedBy: [] };
    // Monster records carry no source book; a list record for the same spell
    // usually does, so keep the first non-empty one we see.
    if ( !rec.source && spell.source ) rec.source = spell.source;
    if ( !rec.wantedBy.includes(who) ) rec.wantedBy.push(who);
    notFound.set(spell.key, rec);
  };

  if ( targets.includes(TARGETS.MONSTERS) ) {
    for ( const mon of state.monsters ) {
      const record = manifest.monsters[mon.id];
      if ( !record ) continue;
      // Out of scope for this destination: not this run's business at all, so
      // neither written nor reported.
      if ( !wantsScope(destination, mon.scope) ) continue;
      const spells = [];
      const seen = new Set();   // dedupe a key appearing twice in one record; keep the first
      for ( const s of record.spells ) {
        if ( seen.has(s.key) ) continue;
        seen.add(s.key);
        // Already satisfied -- by an earlier run, or by hand. Nothing to write
        // and nothing to report: "not found" has to mean "you are still
        // missing this", not "this wasn't in the packs you ticked this time".
        // Checking this before the index lookup is what makes a narrow re-scan
        // (one freshly imported compendium, say) report only what is genuinely
        // still absent, instead of every spell the earlier run already placed.
        if ( mon.haveKeys.has(s.key) ) continue;
        const match = index.get(s.key);
        if ( !match ) {
          miss(s, mon.name);
          continue;
        }
        spells.push({ name: s.name, key: s.key, prep: s.prep, perDay: s.perDay ?? null, match });
      }
      if ( spells.length ) {
        writes.push({ kind: "monster", uuid: mon.uuid, targetName: mon.name,
                      scope: mon.scope, spells });
      }
    }
  }

  if ( targets.includes(TARGETS.LISTS) && listsAvailable(destination) ) {
    for ( const list of state.lists ) {
      const record = manifest.spellLists[list.pageKey];
      if ( !record ) continue;
      const spells = [];
      const seen = new Set();   // dedupe a key appearing twice in one record; keep the first
      for ( const s of record.spells ) {
        if ( seen.has(s.key) ) continue;
        seen.add(s.key);
        // Satisfied by name, not by uuid: an earlier run may have linked a copy
        // of this spell from a different compendium, and re-linking a second
        // copy under a new uuid would put the same spell on the list twice.
        if ( list.haveKeys?.has(s.key) ) continue;
        const match = index.get(s.key);
        if ( !match ) {
          miss(s, list.name);
          continue;
        }
        if ( list.haveUuids.has(match.uuid) ) continue;
        spells.push({ name: s.name, key: s.key, match });
      }
      if ( spells.length ) {
        writes.push({ kind: "list", uuid: list.uuid, targetName: list.name, spells });
      }
    }
  }

  const monsterWrites = writes.filter(w => w.kind === "monster");
  const listWrites = writes.filter(w => w.kind === "list");
  return {
    writes,
    notFound: [...notFound.values()].sort((a, b) => a.key.localeCompare(b.key)),
    counts: {
      spells: monsterWrites.reduce((n, w) => n + w.spells.length, 0),
      monsters: monsterWrites.length,
      listEntries: listWrites.reduce((n, w) => n + w.spells.length, 0),
      lists: listWrites.length,
      notFound: notFound.size,
    },
  };
}
