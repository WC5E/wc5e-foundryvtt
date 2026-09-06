import { test, expect } from "vitest";
import { buildSearchIndex } from "../module/scripts/auto-assign/index.mjs";
import { getPack, packs } from "./__mocks__/auto-assign/index.js";

test("indexes spells and skips non-spell items", async () => {
	const idx = await buildSearchIndex(["a.spells"], { getPack });
	expect(idx.size).toBe(2);
	expect(idx.get("a sword")).toBe(undefined);
});

test("returns the uuid, name and source pack", async () => {
	const idx = await buildSearchIndex(["a.spells"], { getPack });
	expect(idx.get("ice knife")).toEqual({
		uuid: "Compendium.a.spells.Item.1",
		name: "Ice Knife",
		packId: "a.spells",
		packLabel: "A Spells",
	});
});

test("first pack in the given order wins", async () => {
	const first = await buildSearchIndex(["a.spells", "b.spells"], { getPack });
	expect(first.get("ice knife").packId).toBe("a.spells");
	const second = await buildSearchIndex(["b.spells", "a.spells"], { getPack });
	expect(second.get("ice knife").packId).toBe("b.spells");
});

test("skips packs that are not Item packs", async () => {
	const idx = await buildSearchIndex(["c.actors"], { getPack });
	expect(idx.size).toBe(0);
});

test("records a failing pack instead of throwing", async () => {
	const idx = await buildSearchIndex(["d.broken", "a.spells"], { getPack });
	expect(idx.size).toBe(2);
	expect(idx.failed.length).toBe(1);
	expect(idx.failed[0].packId).toBe("d.broken");
	expect(idx.failed[0].error).toMatch(/index unavailable/);
});

test("records an unknown pack id", async () => {
	const idx = await buildSearchIndex(["nope"], { getPack });
	expect(idx.failed[0].packId).toBe("nope");
});

test("applies aliases when indexing", async () => {
	const idx = await buildSearchIndex(["b.spells"], {
		getPack,
		aliases: { hex: "hex curse" },
	});
	expect(idx.get("hex curse")).toBeTruthy();
	expect(idx.get("hex")).toBe(undefined);
});

test("reads only the packs it is given", async () => {
	const read = [];
	const spy = (id) => {
		read.push(id);
		return packs[id];
	};
	await buildSearchIndex(["a.spells"], { getPack: spy });
	expect(read).toEqual(["a.spells"]);
});

test("onProgress is called for a normal Item pack", async () => {
	const calls = [];
	const onProgress = (done, total, label) => calls.push({ done, total, label });
	await buildSearchIndex(["a.spells"], { getPack, onProgress });
	expect(calls.length).toBe(1);
	expect(calls[0]).toEqual({ done: 1, total: 1, label: "A Spells" });
});

test("onProgress is called for a non-Item pack", async () => {
	const calls = [];
	const onProgress = (done, total, label) => calls.push({ done, total, label });
	await buildSearchIndex(["c.actors"], { getPack, onProgress });
	expect(calls.length).toBe(1);
	expect(calls[0]).toEqual({ done: 1, total: 1, label: "C Actors" });
});

test("onProgress is called for a pack whose getIndex throws", async () => {
	const calls = [];
	const onProgress = (done, total, label) => calls.push({ done, total, label });
	await buildSearchIndex(["d.broken"], { getPack, onProgress });
	expect(calls.length).toBe(1);
	expect(calls[0]).toEqual({ done: 1, total: 1, label: "D Broken" });
});

test("onProgress is called for an unresolvable pack", async () => {
	const calls = [];
	const onProgress = (done, total, label) => calls.push({ done, total, label });
	await buildSearchIndex(["nope"], { getPack, onProgress });
	expect(calls.length).toBe(1);
	expect(calls[0]).toEqual({ done: 1, total: 1, label: "nope" });
});

test("onProgress receives the (done, total) sequence for multiple packs", async () => {
	const calls = [];
	const onProgress = (done, total) => calls.push({ done, total });
	await buildSearchIndex(["a.spells", "d.broken", "c.actors", "nope"], {
		getPack,
		onProgress,
	});
	expect(calls.length).toBe(4);
	expect(calls).toEqual([
		{ done: 1, total: 4 },
		{ done: 2, total: 4 },
		{ done: 3, total: 4 },
		{ done: 4, total: 4 },
	]);
});
