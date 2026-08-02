import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackTree, selectedPackIds, nodeState, packIdsUnder }
  from "../scripts/auto-assign/tree.mjs";

const FIXTURE = {
  folders: [
    { id: "f1", name: "DBB Core Source", parentId: null },
    { id: "f2", name: "DBB Extra Source", parentId: null },
    { id: "f3", name: "Nested", parentId: "f1" },
    { id: "f4", name: "Empty", parentId: null },
  ],
  packs: [
    { id: "p.core.spells", name: "DBB Core Source Spells", folderId: "f1" },
    { id: "p.core.items", name: "DBB Core Source Items", folderId: "f1" },
    { id: "p.nested", name: "Nested Spells", folderId: "f3" },
    { id: "p.extra.spells", name: "DBB Extra Source Spells", folderId: "f2" },
    { id: "p.loose", name: "Loose Pack", folderId: null },
  ],
};

test("nests folders and puts loose packs at the root", () => {
  const tree = buildPackTree(FIXTURE);
  assert.deepEqual(tree.map(n => n.name),
    ["DBB Core Source", "DBB Extra Source", "Loose Pack"]);
  const core = tree[0];
  assert.deepEqual(core.children.map(n => n.name),
    ["Nested", "DBB Core Source Items", "DBB Core Source Spells"]);
  assert.equal(core.children[0].children[0].id, "p.nested");
});

test("omits folders with no packs at any depth", () => {
  const tree = buildPackTree(FIXTURE);
  assert.equal(tree.find(n => n.name === "Empty"), undefined);
});

test("keeps a folder whose only packs are in a subfolder", () => {
  const tree = buildPackTree({
    folders: [{ id: "a", name: "Outer", parentId: null },
              { id: "b", name: "Inner", parentId: "a" }],
    packs: [{ id: "p", name: "P", folderId: "b" }],
  });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].children[0].id, "p");
});

test("a folder pointing at a missing parent lands at the root", () => {
  const tree = buildPackTree({
    folders: [{ id: "orphan", name: "Orphan", parentId: "gone" }],
    packs: [{ id: "p", name: "P", folderId: "orphan" }],
  });
  assert.deepEqual(tree.map(n => n.name), ["Orphan"]);
});

test("packIdsUnder collects the whole subtree", () => {
  const tree = buildPackTree(FIXTURE);
  assert.deepEqual(packIdsUnder(tree[0]).sort(),
    ["p.core.items", "p.core.spells", "p.nested"]);
});

test("selectedPackIds returns ticked packs in tree order", () => {
  const tree = buildPackTree(FIXTURE);
  const checked = new Set(["p.loose", "p.nested", "p.core.spells"]);
  assert.deepEqual(selectedPackIds(tree, checked),
    ["p.nested", "p.core.spells", "p.loose"]);
});

test("a folder is checked only when every descendant pack is", () => {
  const tree = buildPackTree(FIXTURE);
  const core = tree[0];
  assert.equal(nodeState(core, new Set()), "unchecked");
  assert.equal(nodeState(core, new Set(["p.core.spells"])), "indeterminate");
  assert.equal(nodeState(core, new Set(packIdsUnder(core))), "checked");
});

test("a pack node reports its own state", () => {
  const tree = buildPackTree(FIXTURE);
  const loose = tree.find(n => n.id === "p.loose");
  assert.equal(nodeState(loose, new Set(["p.loose"])), "checked");
  assert.equal(nodeState(loose, new Set()), "unchecked");
});

test("a cyclic parent chain does not hang", () => {
  const tree = buildPackTree({
    folders: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }],
    packs: [{ id: "p", name: "P", folderId: "a" }],
  });
  assert.ok(Array.isArray(tree));
});
