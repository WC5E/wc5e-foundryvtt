import { test, expect } from "vitest";
import { spellItemData, applyPlan, collectState, MODULE_ID }
  from "../module/scripts/auto-assign/apply.mjs";
import { TARGETS, DESTINATIONS } from "../module/scripts/auto-assign/plan.mjs";

const SOURCE = {
  toObject: () => ({ _id: "src1", name: "Hex", type: "spell",
                     system: { level: 1, preparation: { mode: "prepared", prepared: false } } }),
};

// dnd5e 5.1 replaced system.preparation with system.method + system.prepared.
// The back-compat shim only fires when the new fields are absent, and
// toObject() on a 5.x spell always emits them -- so writing `preparation`
// would be silently dropped and every assigned spell would land as method:"".
test("spellItemData strips the source id and sets the dnd5e 5.x method fields", () => {
  const d = spellItemData(SOURCE, { prep: "atwill", perDay: null });
  expect(d._id).toBe(undefined);
  expect(d.system.method).toBe("atwill");
  expect(d.system.prepared).toBe(0);
  expect(d.system.preparation, "the removed 5.0 field must not be written").toBe(undefined);
});

test("spellItemData maps prepared to method 'spell'", () => {
  const d = spellItemData(SOURCE, { prep: "prepared", perDay: null });
  expect(d.system.method).toBe("spell");
  expect(d.system.prepared).toBe(1);
});

test("spellItemData maps innate to its own method", () => {
  const d = spellItemData(SOURCE, { prep: "innate", perDay: 2 });
  expect(d.system.method).toBe("innate");
  expect(d.system.prepared).toBe(0);
});

test("spellItemData overwrites a method the source document already carried", () => {
  const src = { toObject: () => ({ _id: "x", name: "Hex", type: "spell",
    system: { level: 1, method: "", prepared: 0 } }) };
  const d = spellItemData(src, { prep: "atwill", perDay: null });
  expect(d.system.method).toBe("atwill");
});

test("spellItemData sets per-day uses for innate casting", () => {
  const d2 = spellItemData(SOURCE, { prep: "innate", perDay: 2 });
  expect(d2.system.uses).toEqual(
    { max: "2", spent: 0, recovery: [{ period: "day", type: "recoverAll" }] });
});

test("spellItemData leaves uses alone when there is no per-day count", () => {
  const d = spellItemData(SOURCE, { prep: "atwill", perDay: null });
  expect(d.system.uses).toBe(undefined);
});

function fakeActor(id) {
  return { id, created: [], async createEmbeddedDocuments(_t, data) {
    this.created.push(...data); return data;
  } };
}

function harness({ locked = true, failOn = null } = {}) {
  const actor = fakeActor("m1");
  const page = { uuid: "page1", system: { spells: ["Compendium.x.Item.old"] },
                 updates: [], async update(d) {
 this.updates.push(d); 
} };
  const pack = {
    collection: `${MODULE_ID}.monsters`, locked,
    configured: [],
    async configure(c) {
 this.configured.push(c); this.locked = c.locked ?? this.locked; 
},
    async getDocument() {
 return actor; 
},
  };
  const deps = {
    getPack: () => pack,
    resolveUuid: async uuid => {
      if ( failOn && uuid === failOn ) {
 throw new Error("boom"); 
}
      if ( uuid === "page1" ) {
 return page; 
}
      if ( uuid.startsWith("Compendium.wc5e-foundryvtt.monsters")) {
 return actor; 
}
      return SOURCE;
    },
  };
  return { actor, page, pack, deps };
}

const MONSTER_WRITE = {
  kind: "monster", uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m1",
  targetName: "Fel Imp", scope: "pack",
  spells: [{ name: "Hex", key: "hex", prep: "innate", perDay: 2,
             match: { uuid: "Compendium.x.Item.2" } }],
};

test("creates the embedded spell on the target actor", async () => {
  const h = harness();
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(res.added).toBe(1);
  expect(h.actor.created[0].name).toBe("Hex");
  expect(h.actor.created[0].system.method).toBe("innate");
});

test("unlocks a locked pack and re-locks it afterwards", async () => {
  const h = harness({ locked: true });
  await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(h.pack.configured).toEqual([{ locked: false }, { locked: true }]);
});

test("leaves an already-unlocked pack unlocked", async () => {
  const h = harness({ locked: false });
  await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(h.pack.configured).toEqual([]);
});

test("re-locks even when a write throws", async () => {
  const h = harness({ locked: true, failOn: "Compendium.x.Item.2" });
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(h.pack.configured).toEqual([{ locked: false }, { locked: true }]);
  expect(res.failures.length).toBe(1);
  expect(res.added).toBe(0);
});

test("aborts without writing when a pack cannot be unlocked", async () => {
  const h = harness({ locked: true });
  h.pack.configure = async c => {
    if ( c.locked === false ) {
 throw new Error("permission denied"); 
}
  };
  await expect(applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps }))
    .rejects.toThrow(/Could not unlock .*permission denied/);
  expect(h.actor.created.length).toBe(0);
});

test("re-lock failure is reported, not swallowed", async () => {
  const h = harness({ locked: true });
  h.pack.configure = async c => {
    h.pack.configured.push(c);
    if ( c.locked === true ) {
 throw new Error("network blip"); 
}
  };
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(res.added).toBe(1);
  expect(res.failures.length).toBe(1);
  expect(res.failures[0].target).toBe(`${MODULE_ID}.monsters`);
  expect(res.failures[0].error).toMatch(/re-lock/);
});

test("a re-lock failure and a write failure are both reported", async () => {
  const h = harness({ locked: true, failOn: "Compendium.x.Item.2" });
  h.pack.configure = async c => {
    h.pack.configured.push(c);
    if ( c.locked === true ) {
 throw new Error("network blip"); 
}
  };
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  expect(res.added).toBe(0);
  expect(res.failures.length).toBe(2);
  expect(res.failures.some(f => f.target === MONSTER_WRITE.targetName)).toBeTruthy();
  expect(res.failures.some(f => f.target === `${MODULE_ID}.monsters` && /re-lock/.test(f.error))).toBeTruthy();
});

test("appends to a spell list without dropping what is already there", async () => {
  const h = harness();
  const write = { kind: "list", uuid: "page1", targetName: "Mage Spells",
                  spells: [{ name: "Hex", key: "hex", match: { uuid: "Compendium.x.Item.2" } }] };
  const res = await applyPlan({ writes: [write] }, { deps: h.deps });
  expect(res.entriesAdded).toBe(1);
  expect(h.page.updates[0]["system.spells"].sort()).toEqual(
    ["Compendium.x.Item.2", "Compendium.x.Item.old"]);
});

test("a failure on one write does not stop the others", async () => {
  const h = harness({ failOn: "Compendium.x.Item.2" });
  const ok = { ...MONSTER_WRITE, spells: [{ name: "Ice Knife", key: "ice knife",
    prep: "prepared", perDay: null, match: { uuid: "Compendium.x.Item.1" } }] };
  const res = await applyPlan({ writes: [MONSTER_WRITE, ok] }, { deps: h.deps });
  expect(res.added).toBe(1);
  expect(res.failures.length).toBe(1);
});

test("collectState reads existing spell names off the actor", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const packActor = { id: "m1", uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m1",
                      items: [{ type: "spell", name: "Hex" }, { type: "weapon", name: "Claw" }] };
  const deps = {
    getPack: () => ({ collection: `${MODULE_ID}.monsters`,
                      async getDocuments() {
 return [packActor]; 
} }),
    getWorldActors: () => [],
  };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.COMPENDIUM, deps });
  expect(s.monsters.length).toBe(1);
  expect(s.monsters[0].haveKeys.has("hex")).toBeTruthy();
  expect(!s.monsters[0].haveKeys.has("claw")).toBeTruthy();
});

test("collectState finds world actors imported from our pack", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const worldActor = { id: "w1", uuid: "Actor.w1", items: [],
                       _stats: { compendiumSource: "Compendium.wc5e-foundryvtt.monsters.Actor.m1" } };
  const deps = { getPack: () => ({ async getDocuments() {
 return []; 
} }),
                 getWorldActors: () => [worldActor] };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.WORLD, deps });
  expect(s.monsters[0].id).toBe("m1");
  expect(s.monsters[0].scope).toBe("world");
  expect(s.monsters[0].uuid).toBe("Actor.w1");
});

test("collectState falls back to the legacy sourceId flag", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const legacy = { id: "w2", uuid: "Actor.w2", items: [], _stats: {},
                   flags: { core: { sourceId: "Compendium.wc5e-foundryvtt.monsters.Actor.m1" } } };
  const deps = { getPack: () => ({ async getDocuments() {
 return []; 
} }),
                 getWorldActors: () => [legacy] };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.WORLD, deps });
  expect(s.monsters.length).toBe(1);
});
