import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normaliseName, loadManifest, manifestTotals, MANIFEST_VERSION }
  from "../scripts/auto-assign/manifest.mjs";

test("lowercases and collapses whitespace", () => {
  assert.equal(normaliseName("  Ice   Knife "), "ice knife");
});

test("strips source superscripts", () => {
  assert.equal(normaliseName("Absorb Elements ^XGE^"), "absorb elements");
});

test("strips the custom-spell marker and asterisks", () => {
  assert.equal(normaliseName("✦Shadow Bolt*"), "shadow bolt");
});

test("drops parenthesised suffixes", () => {
  assert.equal(normaliseName("Fireball (self only)"), "fireball");
});

test("strips leading and trailing punctuation", () => {
  assert.equal(normaliseName("- hex."), "hex");
});

test("applies aliases last", () => {
  assert.equal(normaliseName("Call Lighting", { "call lightning": "x", "call lighting": "call lightning" }),
    "call lightning");
});

test("tolerates null and undefined", () => {
  assert.equal(normaliseName(null), "");
  assert.equal(normaliseName(undefined), "");
});

// Adversarial cases for zero-width and whitespace-adjacent characters that
// have historically survived from Homebrewery/GMBinder/PDF extraction into
// spell names. Each expected value below was verified against Python's
// spell_embed._norm() directly, not assumed -- see task-5 fix report.
// JS's \s matches U+FEFF (BOM) but Python's re \s does not, and neither
// matches U+200B/C/D, so both sides strip these explicitly before the
// whitespace collapse rather than relying on \s semantics to agree.

test("strips a byte-order mark embedded in the name", () => {
  assert.equal(normaliseName("na﻿me"), "name");
});

test("strips a zero-width space", () => {
  assert.equal(normaliseName("na​me"), "name");
});

test("strips zero-width non-joiner and joiner", () => {
  assert.equal(normaliseName("na‌me"), "name");
  assert.equal(normaliseName("na‍me"), "name");
});

test("collapses a non-breaking space like ordinary whitespace", () => {
  assert.equal(normaliseName("na me"), "na me");
});

test("collapses a tab like ordinary whitespace", () => {
  assert.equal(normaliseName("na\tme"), "na me");
});

test("collapses an embedded newline like ordinary whitespace", () => {
  assert.equal(normaliseName("na\nme"), "na me");
});

test("reduces a punctuation-only name to the empty string", () => {
  assert.equal(normaliseName("-.:; "), "");
});

test("passes the empty string through unchanged", () => {
  assert.equal(normaliseName(""), "");
});

test("reduces a whitespace-only name to the empty string", () => {
  assert.equal(normaliseName("   \t\n  "), "");
});

test("matches the keys Python wrote, for every record in the real manifest", () => {
  const m = JSON.parse(fs.readFileSync("assets/missing-spells.json", "utf8"));
  const records = [
    ...Object.values(m.monsters).flatMap(r => r.spells),
    ...Object.values(m.spellLists).flatMap(r => r.spells),
  ];
  assert.ok(records.length > 300, `expected the real manifest, got ${records.length} records`);
  for ( const r of records ) {
    assert.equal(normaliseName(r.name, m.aliases), r.key,
      `JS and Python normalisers disagree on ${JSON.stringify(r.name)}`);
  }
});

test("loadManifest rejects an unknown version", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: 99 }) });
  await assert.rejects(() => loadManifest(fake), /version/i);
});

test("loadManifest rejects a failed fetch", async () => {
  const fake = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => loadManifest(fake), /404/);
});

test("loadManifest fills in absent sections", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: MANIFEST_VERSION }) });
  const m = await loadManifest(fake);
  assert.deepEqual(m.monsters, {});
  assert.deepEqual(m.spellLists, {});
  assert.deepEqual(m.aliases, {});
});

test("manifestTotals counts documents and references separately", () => {
  const m = {
    monsters: { a: { spells: [{}, {}] }, b: { spells: [{}] } },
    spellLists: { "j.p": { spells: [{}, {}, {}] } },
  };
  assert.deepEqual(manifestTotals(m),
    { monsters: 2, monsterSpells: 3, lists: 1, listSpells: 3 });
});
