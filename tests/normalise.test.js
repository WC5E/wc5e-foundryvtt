import { test, expect } from "vitest";
import fs from "node:fs";
import { normaliseName, loadManifest, manifestTotals, MANIFEST_VERSION }
  from "../scripts/auto-assign/manifest.mjs";

test("lowercases and collapses whitespace", () => {
  expect(normaliseName("  Ice   Knife ")).toBe("ice knife");
});

test("strips source superscripts", () => {
  expect(normaliseName("Absorb Elements ^XGE^")).toBe("absorb elements");
});

test("strips the custom-spell marker and asterisks", () => {
  expect(normaliseName("✦Shadow Bolt*")).toBe("shadow bolt");
});

test("drops parenthesised suffixes", () => {
  expect(normaliseName("Fireball (self only)")).toBe("fireball");
});

test("strips leading and trailing punctuation", () => {
  expect(normaliseName("- hex.")).toBe("hex");
});

test("applies aliases last", () => {
  expect(normaliseName("Call Lighting", { "call lightning": "x", "call lighting": "call lightning" }))
    .toBe("call lightning");
});

test("tolerates null and undefined", () => {
  expect(normaliseName(null)).toBe("");
  expect(normaliseName(undefined)).toBe("");
});

// Adversarial cases for zero-width and whitespace-adjacent characters that
// have historically survived from Homebrewery/GMBinder/PDF extraction into
// spell names. Each expected value below was verified against Python's
// spell_embed._norm() directly, not assumed -- see task-5 fix report.
// JS's \s matches U+FEFF (BOM) but Python's re \s does not, and neither
// matches U+200B/C/D, so both sides strip these explicitly before the
// whitespace collapse rather than relying on \s semantics to agree.

test("strips a byte-order mark embedded in the name", () => {
  expect(normaliseName("na﻿me")).toBe("name");
});

test("strips a zero-width space", () => {
  expect(normaliseName("na​me")).toBe("name");
});

test("strips zero-width non-joiner and joiner", () => {
  expect(normaliseName("na‌me")).toBe("name");
  expect(normaliseName("na‍me")).toBe("name");
});

test("collapses a non-breaking space like ordinary whitespace", () => {
  expect(normaliseName("na me")).toBe("na me");
});

test("collapses a tab like ordinary whitespace", () => {
  expect(normaliseName("na\tme")).toBe("na me");
});

test("collapses an embedded newline like ordinary whitespace", () => {
  expect(normaliseName("na\nme")).toBe("na me");
});

test("reduces a punctuation-only name to the empty string", () => {
  expect(normaliseName("-.:; ")).toBe("");
});

test("passes the empty string through unchanged", () => {
  expect(normaliseName("")).toBe("");
});

test("reduces a whitespace-only name to the empty string", () => {
  expect(normaliseName("   \t\n  ")).toBe("");
});

test("matches the keys Python wrote, for every record in the real manifest", () => {
  const m = JSON.parse(fs.readFileSync("assets/missing-spells.json", "utf8"));
  const records = [
    ...Object.values(m.monsters).flatMap(r => r.spells),
    ...Object.values(m.spellLists).flatMap(r => r.spells),
  ];
  expect(records.length, `expected the real manifest, got ${records.length} records`).toBeGreaterThan(300);
  for ( const r of records ) {
    expect(normaliseName(r.name, m.aliases),
      `JS and Python normalisers disagree on ${JSON.stringify(r.name)}`).toBe(r.key);
  }
});

test("loadManifest rejects an unknown version", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: 99 }) });
  await expect(loadManifest(fake)).rejects.toThrow(/version/i);
});

test("loadManifest rejects a failed fetch", async () => {
  const fake = async () => ({ ok: false, status: 404 });
  await expect(loadManifest(fake)).rejects.toThrow(/404/);
});

test("loadManifest fills in absent sections", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: MANIFEST_VERSION }) });
  const m = await loadManifest(fake);
  expect(m.monsters).toEqual({});
  expect(m.spellLists).toEqual({});
  expect(m.aliases).toEqual({});
});

test("manifestTotals counts documents and references separately", () => {
  const m = {
    monsters: { a: { spells: [{}, {}] }, b: { spells: [{}] } },
    spellLists: { "j.p": { spells: [{}, {}, {}] } },
  };
  expect(manifestTotals(m)).toEqual(
    { monsters: 2, monsterSpells: 3, lists: 1, listSpells: 3 });
});
