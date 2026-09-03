import { test, expect } from "vitest";
import { buildPackTree, selectedPackIds, nodeState, packIdsUnder } from "../module/scripts/auto-assign/tree.mjs";

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
	expect(tree.map((n) => n.name)).toEqual(["DBB Core Source", "DBB Extra Source", "Loose Pack"]);
	const core = tree[0];
	expect(core.children.map((n) => n.name)).toEqual(["Nested", "DBB Core Source Items", "DBB Core Source Spells"]);
	expect(core.children[0].children[0].id).toBe("p.nested");
});

test("omits folders with no packs at any depth", () => {
	const tree = buildPackTree(FIXTURE);
	expect(tree.find((n) => n.name === "Empty")).toBe(undefined);
});

test("keeps a folder whose only packs are in a subfolder", () => {
	const tree = buildPackTree({
		folders: [
			{ id: "a", name: "Outer", parentId: null },
			{ id: "b", name: "Inner", parentId: "a" },
		],
		packs: [{ id: "p", name: "P", folderId: "b" }],
	});
	expect(tree.length).toBe(1);
	expect(tree[0].children[0].children[0].id).toBe("p");
});

test("a folder pointing at a missing parent lands at the root", () => {
	const tree = buildPackTree({
		folders: [{ id: "orphan", name: "Orphan", parentId: "gone" }],
		packs: [{ id: "p", name: "P", folderId: "orphan" }],
	});
	expect(tree.map((n) => n.name)).toEqual(["Orphan"]);
});

test("packIdsUnder collects the whole subtree", () => {
	const tree = buildPackTree(FIXTURE);
	expect(packIdsUnder(tree[0]).sort()).toEqual(["p.core.items", "p.core.spells", "p.nested"]);
});

test("selectedPackIds returns ticked packs in tree order", () => {
	const tree = buildPackTree(FIXTURE);
	const checked = new Set(["p.loose", "p.nested", "p.core.spells"]);
	expect(selectedPackIds(tree, checked)).toEqual(["p.nested", "p.core.spells", "p.loose"]);
});

test("a folder is checked only when every descendant pack is", () => {
	const tree = buildPackTree(FIXTURE);
	const core = tree[0];
	expect(nodeState(core, new Set())).toBe("unchecked");
	expect(nodeState(core, new Set(["p.core.spells"]))).toBe("indeterminate");
	expect(nodeState(core, new Set(packIdsUnder(core)))).toBe("checked");
});

test("a pack node reports its own state", () => {
	const tree = buildPackTree(FIXTURE);
	const loose = tree.find((n) => n.id === "p.loose");
	expect(nodeState(loose, new Set(["p.loose"]))).toBe("checked");
	expect(nodeState(loose, new Set())).toBe("unchecked");
});

test("a cyclic parent chain does not hang", () => {
	const tree = buildPackTree({
		folders: [
			{ id: "a", name: "A", parentId: "b" },
			{ id: "b", name: "B", parentId: "a" },
		],
		packs: [{ id: "p", name: "P", folderId: "a" }],
	});
	expect(Array.isArray(tree)).toBeTruthy();
});
