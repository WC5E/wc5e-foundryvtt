/**
 * The auto-assign manifest: the spell names this module could not resolve at
 * build time, so the runtime tool knows what to go looking for.
 *
 * normaliseName() is a port of spell_embed._norm() in the Python build. If the
 * two drift, every lookup misses and the tool silently finds nothing --
 * tests/normalise.test.js checks the port against every record in the real
 * manifest for exactly that reason.
 */

export const MANIFEST_VERSION = 1;

const MANIFEST_PATH = "modules/wc5e-foundryvtt/assets/missing-spells.json";

/**
 * @param {string} raw            a spell name as printed in the source
 * @param {object} [aliases]      manifest alias table, applied last
 * @returns {string}              the lookup key
 */
export function normaliseName(raw, aliases = {}) {
  let n = String(raw ?? "").toLowerCase();
  n = n.replace(/\^[a-z]+\^/g, "");
  n = n.replace(/✦/g, "").replace(/\*/g, "");
  n = n.replace(/\([^)]*\)/g, "");
  n = n.replace(/<\/?br\s*\/?>/g, "");
  // Strip zero-width characters (BOM, ZWSP, ZWNJ, ZWJ) that survive from
  // Homebrewery/GMBinder/PDF extraction. JS's \s matches U+FEFF but Python's
  // re \s does not (and neither matches U+200B/C/D), so this is an explicit
  // strip on both sides rather than relying on differing \s semantics --
  // keep build/spell_embed.py's _norm() in step with this.
  n = n.replace(/[﻿​‌‍]/g, "");
  // Python's re \s matches these, JS's does not -- normalise to a plain space
  // on both sides so the two engines cannot disagree.
  n = n.replace(/[\u0085\u001C-\u001F]/g, " ");
  // Collapse first, then strip -- Task 2 reordered these two steps in
  // spell_embed._norm() (stripping first leaves a trailing space behind a
  // newline). This port must stay in the same order.
  n = n.replace(/\s+/g, " ");
  n = n.replace(/^[ .:;-]+/, "").replace(/[ .:;-]+$/, "");
  return Object.prototype.hasOwnProperty.call(aliases, n) ? aliases[n] : n;
}

/**
 * @param {Function} [fetchImpl]  injected for tests
 * @returns {Promise<{aliases: object, monsters: object, spellLists: object}>}
 * @throws {Error} on a missing file, bad JSON, or an unknown version
 */
export async function loadManifest(fetchImpl = fetch) {
  const res = await fetchImpl(MANIFEST_PATH);
  if ( !res.ok ) throw new Error(`Could not load ${MANIFEST_PATH} (HTTP ${res.status})`);
  const data = await res.json();
  if ( data?.version !== MANIFEST_VERSION ) {
    throw new Error(`Unsupported manifest version ${data?.version}, expected ${MANIFEST_VERSION}`);
  }
  return {
    aliases: data.aliases ?? {},
    monsters: data.monsters ?? {},
    spellLists: data.spellLists ?? {},
  };
}

/** Counts for the dialog's target labels and the first-run prompt. */
export function manifestTotals(manifest) {
  const monsters = Object.values(manifest.monsters ?? {});
  const lists = Object.values(manifest.spellLists ?? {});
  return {
    monsters: monsters.length,
    monsterSpells: monsters.reduce((n, r) => n + (r.spells?.length ?? 0), 0),
    lists: lists.length,
    listSpells: lists.reduce((n, r) => n + (r.spells?.length ?? 0), 0),
  };
}
