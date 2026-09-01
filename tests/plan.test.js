import { test, expect } from "vitest";
import { buildPlan, listsAvailable, TARGETS, DESTINATIONS }
  from "../module/scripts/auto-assign/plan.mjs";

const MANIFEST = {
  aliases: {},
  monsters: {
    m1: { name: "Frost Revenant", pack: "monsters", spells: [
      { name: "Ice Knife", key: "ice knife", prep: "prepared", level: 1, perDay: null },
      { name: "Shape Water", key: "shape water", prep: "atwill", level: 0, perDay: null },
    ] },
    m2: { name: "Fel Imp", pack: "monsters", spells: [
      { name: "Hex", key: "hex", prep: "innate", level: 1, perDay: 2 },
    ] },
  },
  spellLists: {
    "j.p1": { name: "Mage Spells", identifier: "wc5e-mage", pack: "spell-lists", spells: [
      { name: "Synaptic Static", key: "synaptic static", source: "XGE" },
      { name: "Ice Knife", key: "ice knife", source: "XGE" },
    ] },
  },
};

const MATCHES = {
  "ice knife": { uuid: "Compendium.x.Item.1", name: "Ice Knife", packId: "x", packLabel: "X" },
  "hex": { uuid: "Compendium.x.Item.2", name: "Hex", packId: "x", packLabel: "X" },
};
const index = { get: k => MATCHES[k], size: 2, failed: [] };

function state({ have = {}, listHave = [], listHaveKeys = [],
                 scopes = { m1: "pack", m2: "pack" } } = {}) {
  return {
    monsters: Object.keys(MANIFEST.monsters).map(id => ({
      id, name: MANIFEST.monsters[id].name, scope: scopes[id],
      uuid: `Compendium.wc5e-foundryvtt.monsters.Actor.${id}`,
      haveKeys: new Set(have[id] ?? []),
    })),
    lists: [{ pageKey: "j.p1", name: "Mage Spells",
              uuid: "Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.j.JournalEntryPage.p1",
              haveUuids: new Set(listHave), haveKeys: new Set(listHaveKeys) }],
  };
}

const ALL = [TARGETS.MONSTERS, TARGETS.LISTS];

test("plans the matches it found and reports the rest", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  expect(p.counts.spells).toBe(2);        // ice knife on m1, hex on m2
  expect(p.counts.monsters).toBe(2);
  expect(p.counts.listEntries).toBe(1);   // ice knife on the mage list
  expect(p.notFound.map(n => n.key)).toEqual(["shape water", "synaptic static"]);
});

test("not-found records name who wanted them", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  const sw = p.notFound.find(n => n.key === "shape water");
  expect(sw.wantedBy).toEqual(["Frost Revenant"]);
  expect(sw.name).toBe("Shape Water");
});

test("not-found carries the source book when a record has one", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  expect(p.notFound.find(n => n.key === "synaptic static").source).toBe("XGE");
  expect(p.notFound.find(n => n.key === "shape water").source).toBe("");
});

test("carries preparation mode and per-day uses onto the write", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  const imp = p.writes.find(w => w.targetName === "Fel Imp");
  expect(imp.spells[0].prep).toBe("innate");
  expect(imp.spells[0].perDay).toBe(2);
  expect(imp.spells[0].match.uuid).toBe("Compendium.x.Item.2");
});

test("skips a spell the monster already has", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ have: { m1: ["ice knife"] } }) });
  expect(p.counts.spells).toBe(1);
  expect(p.writes.find(w => w.targetName === "Frost Revenant")).toBe(undefined);
});

test("skips a list entry that already points at that spell", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ listHave: ["Compendium.x.Item.1"] }) });
  expect(p.counts.listEntries).toBe(0);
});

test("a fully satisfied plan is empty — the second run adds nothing", () => {
  const p = buildPlan({
    manifest: MANIFEST, index, targets: ALL, destination: DESTINATIONS.BOTH,
    state: state({ have: { m1: ["ice knife"], m2: ["hex"] },
                   listHave: ["Compendium.x.Item.1"] }),
  });
  expect(p.writes.length).toBe(0);
  expect(p.counts.spells).toBe(0);
  expect(p.counts.listEntries).toBe(0);
});

test("still reports not-found on a second run", () => {
  const p = buildPlan({
    manifest: MANIFEST, index, targets: ALL, destination: DESTINATIONS.BOTH,
    state: state({ have: { m1: ["ice knife"], m2: ["hex"] },
                   listHave: ["Compendium.x.Item.1"] }),
  });
  expect(p.counts.notFound).toBe(2);
});

test("monsters-only target skips the lists", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: [TARGETS.MONSTERS],
                        destination: DESTINATIONS.BOTH, state: state() });
  expect(p.counts.listEntries).toBe(0);
  expect(!p.notFound.some(n => n.key === "synaptic static")).toBeTruthy();
});

test("lists-only target skips the monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: [TARGETS.LISTS],
                        destination: DESTINATIONS.BOTH, state: state() });
  expect(p.counts.spells).toBe(0);
  expect(p.counts.listEntries).toBe(1);
});

test("world destination writes no list entries — lists exist only in the compendium", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.WORLD,
                        state: state({ scopes: { m1: "world", m2: "world" } }) });
  expect(p.counts.listEntries).toBe(0);
  expect(p.counts.spells).toBe(2);
});

test("listsAvailable is false only for the world destination", () => {
  expect(listsAvailable(DESTINATIONS.WORLD)).toBe(false);
  expect(listsAvailable(DESTINATIONS.BOTH)).toBe(true);
  expect(listsAvailable(DESTINATIONS.COMPENDIUM)).toBe(true);
});

test("compendium destination skips world-scoped monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.COMPENDIUM,
                        state: state({ scopes: { m1: "world", m2: "pack" } }) });
  expect(p.writes.filter(w => w.kind === "monster").map(w => w.targetName)).toEqual(
    ["Fel Imp"]);
});

test("world destination skips pack-scoped monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.WORLD,
                        state: state({ scopes: { m1: "world", m2: "pack" } }) });
  expect(p.writes.filter(w => w.kind === "monster").map(w => w.targetName)).toEqual(
    ["Frost Revenant"]);
});

test("a monster in the manifest but absent from state is ignored", () => {
  const s = state();
  s.monsters = s.monsters.filter(m => m.id === "m1");
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: s });
  expect(p.writes.filter(w => w.kind === "monster").length).toBe(1);
});

test("the same monster imported twice gets one write each", () => {
  const s = state();
  s.monsters.push({ id: "m1", name: "Frost Revenant", scope: "world",
                    uuid: "Actor.copy", haveKeys: new Set() });
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: s });
  expect(p.writes.filter(w => w.targetName === "Frost Revenant").length).toBe(2);
  expect(p.counts.spells).toBe(3);
});

test("an empty index puts everything in not-found and plans nothing", () => {
  const p = buildPlan({ manifest: MANIFEST, index: { get: () => undefined, size: 0, failed: [] },
                        targets: ALL, destination: DESTINATIONS.BOTH, state: state() });
  expect(p.writes.length).toBe(0);
  expect(p.counts.notFound).toBe(4);
});

// "Not found" means "you are still missing this", NOT "this wasn't in the packs
// you happened to tick on this run". These two started out asserting the
// opposite; a GM who assigned everything, imported three more spells and then
// re-scanned with only the new compendium ticked got 144 false "missing" rows
// for spells already sitting on their monsters.
test("a spell the monster already has is not reported, even when absent from the index", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ have: { m1: ["shape water"] } }) });
  expect(!p.notFound.some(n => n.key === "shape water")).toBeTruthy();
});

test("a narrow re-scan reports only what is genuinely still absent", () => {
  // Everything already assigned except "shape water", and an index that holds
  // only a freshly imported spell -- the exact shape of the bug.
  const narrow = { get: k => (k === "hex" ? MATCHES.hex : undefined), size: 1, failed: [] };
  const p = buildPlan({
    manifest: MANIFEST, index: narrow, targets: ALL, destination: DESTINATIONS.BOTH,
    // haveKeys mirrors haveUuids, because collectState derives one from the other.
    state: state({ have: { m1: ["ice knife"], m2: ["hex"] },
                   listHave: ["Compendium.x.Item.1", "Compendium.x.Item.7"],
                   listHaveKeys: ["ice knife", "synaptic static"] }),
  });
  expect(p.notFound.map(n => n.key)).toEqual(["shape water"]);
  expect(p.writes.length).toBe(0);
});

test("an out-of-scope monster is neither written nor reported", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.COMPENDIUM,
                        state: state({ scopes: { m1: "world", m2: "pack" } }) });
  expect(!p.notFound.some(n => n.key === "shape water")).toBeTruthy();
  expect(!p.writes.some(w => w.targetName === "Frost Revenant")).toBeTruthy();
});

test("a spell already on a list is matched by name, not just by uuid", () => {
  // The GM re-imported Ice Knife into a different compendium, so the list's
  // existing link has a different uuid than this run's match. Linking again
  // would put the same spell on the list twice.
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ listHave: ["Compendium.OLD.Item.99"],
                                       listHaveKeys: ["ice knife"] }) });
  expect(p.counts.listEntries).toBe(0);
  expect(!p.notFound.some(n => n.key === "ice knife")).toBeTruthy();
});

test("a found spell the monster already has is skipped silently, never reported not-found", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ have: { m1: ["ice knife"] } }) });
  expect(!p.notFound.some(n => n.key === "ice knife")).toBeTruthy();
});

test("a duplicated spell key within a monster record produces one entry, not two", () => {
  const manifest = {
    aliases: {},
    monsters: {
      m3: { name: "Doubled Ghoul", pack: "monsters", spells: [
        { name: "Hex", key: "hex", prep: "innate", level: 1, perDay: 2 },
        { name: "Hex", key: "hex", prep: "innate", level: 1, perDay: 2 },
      ] },
    },
    spellLists: {},
  };
  const s = {
    monsters: [{ id: "m3", name: "Doubled Ghoul", scope: "pack",
                 uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m3", haveKeys: new Set() }],
    lists: [],
  };
  const p = buildPlan({ manifest, index, targets: ALL, destination: DESTINATIONS.BOTH, state: s });
  const w = p.writes.find(w => w.targetName === "Doubled Ghoul");
  expect(w.spells.length).toBe(1);
  expect(p.counts.spells).toBe(1);
});

test("a duplicated spell key within a list record produces one entry, not two", () => {
  const manifest = {
    aliases: {},
    monsters: {},
    spellLists: {
      "j.p2": { name: "Doubled List", identifier: "wc5e-x", pack: "spell-lists", spells: [
        { name: "Ice Knife", key: "ice knife", source: "XGE" },
        { name: "Ice Knife", key: "ice knife", source: "XGE" },
      ] },
    },
  };
  const s = {
    monsters: [],
    lists: [{ pageKey: "j.p2", name: "Doubled List",
              uuid: "Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.j.JournalEntryPage.p2",
              haveUuids: new Set() }],
  };
  const p = buildPlan({ manifest, index, targets: ALL, destination: DESTINATIONS.BOTH, state: s });
  const w = p.writes.find(w => w.targetName === "Doubled List");
  expect(w.spells.length).toBe(1);
  expect(p.counts.listEntries).toBe(1);
});
