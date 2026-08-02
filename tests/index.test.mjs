import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex } from "../scripts/auto-assign/index.mjs";

function fakePack(id, label, entries, { documentName = "Item", throws = null } = {}) {
  return {
    collection: id, metadata: { label }, documentName,
    async getIndex() {
      if ( throws ) throw new Error(throws);
      return entries.map(e => ({ _id: e.id, name: e.name, type: e.type ?? "spell",
                                 uuid: `Compendium.${id}.Item.${e.id}` }));
    },
  };
}

const packs = {
  "a.spells": fakePack("a.spells", "A Spells", [
    { id: "1", name: "Ice Knife" },
    { id: "2", name: "Shape Water" },
    { id: "3", name: "A Sword", type: "weapon" },
  ]),
  "b.spells": fakePack("b.spells", "B Spells", [
    { id: "9", name: "Ice Knife" },
    { id: "8", name: "Hex" },
  ]),
  "c.actors": fakePack("c.actors", "C Actors", [{ id: "7", name: "Ghoul" }],
    { documentName: "Actor" }),
  "d.broken": fakePack("d.broken", "D Broken", [], { throws: "index unavailable" }),
};
const getPack = id => packs[id];

test("indexes spells and skips non-spell items", async () => {
  const idx = await buildSearchIndex(["a.spells"], { getPack });
  assert.equal(idx.size, 2);
  assert.equal(idx.get("a sword"), undefined);
});

test("returns the uuid, name and source pack", async () => {
  const idx = await buildSearchIndex(["a.spells"], { getPack });
  assert.deepEqual(idx.get("ice knife"), {
    uuid: "Compendium.a.spells.Item.1", name: "Ice Knife",
    packId: "a.spells", packLabel: "A Spells",
  });
});

test("first pack in the given order wins", async () => {
  const first = await buildSearchIndex(["a.spells", "b.spells"], { getPack });
  assert.equal(first.get("ice knife").packId, "a.spells");
  const second = await buildSearchIndex(["b.spells", "a.spells"], { getPack });
  assert.equal(second.get("ice knife").packId, "b.spells");
});

test("skips packs that are not Item packs", async () => {
  const idx = await buildSearchIndex(["c.actors"], { getPack });
  assert.equal(idx.size, 0);
});

test("records a failing pack instead of throwing", async () => {
  const idx = await buildSearchIndex(["d.broken", "a.spells"], { getPack });
  assert.equal(idx.size, 2);
  assert.equal(idx.failed.length, 1);
  assert.equal(idx.failed[0].packId, "d.broken");
  assert.match(idx.failed[0].error, /index unavailable/);
});

test("records an unknown pack id", async () => {
  const idx = await buildSearchIndex(["nope"], { getPack });
  assert.equal(idx.failed[0].packId, "nope");
});

test("applies aliases when indexing", async () => {
  const idx = await buildSearchIndex(["b.spells"], {
    getPack, aliases: { hex: "hex curse" },
  });
  assert.ok(idx.get("hex curse"));
  assert.equal(idx.get("hex"), undefined);
});

test("reads only the packs it is given", async () => {
  const read = [];
  const spy = id => {
    read.push(id);
    return packs[id];
  };
  await buildSearchIndex(["a.spells"], { getPack: spy });
  assert.deepEqual(read, ["a.spells"]);
});

test("onProgress is called for a normal Item pack", async () => {
  const calls = [];
  const onProgress = (done, total, label) => calls.push({ done, total, label });
  await buildSearchIndex(["a.spells"], { getPack, onProgress });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { done: 1, total: 1, label: "A Spells" });
});

test("onProgress is called for a non-Item pack", async () => {
  const calls = [];
  const onProgress = (done, total, label) => calls.push({ done, total, label });
  await buildSearchIndex(["c.actors"], { getPack, onProgress });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { done: 1, total: 1, label: "C Actors" });
});

test("onProgress is called for a pack whose getIndex throws", async () => {
  const calls = [];
  const onProgress = (done, total, label) => calls.push({ done, total, label });
  await buildSearchIndex(["d.broken"], { getPack, onProgress });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { done: 1, total: 1, label: "D Broken" });
});

test("onProgress is called for an unresolvable pack", async () => {
  const calls = [];
  const onProgress = (done, total, label) => calls.push({ done, total, label });
  await buildSearchIndex(["nope"], { getPack, onProgress });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { done: 1, total: 1, label: "nope" });
});

test("onProgress receives the (done, total) sequence for multiple packs", async () => {
  const calls = [];
  const onProgress = (done, total, label) => calls.push({ done, total });
  await buildSearchIndex(["a.spells", "d.broken", "c.actors", "nope"], {
    getPack, onProgress,
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls, [
    { done: 1, total: 4 },
    { done: 2, total: 4 },
    { done: 3, total: 4 },
    { done: 4, total: 4 },
  ]);
});
