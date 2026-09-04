import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

function readJson(fileName) {
	return JSON.parse(readFileSync(path.join(MONSTERS_DIR, fileName), "utf8"));
}

const MONSTERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/generated/monsters");

const monsterFileNames = readdirSync(MONSTERS_DIR)
	.filter((fileName) => fileName.endsWith(".json"))
	.filter((fileName) => !fileName.startsWith("_folder-"));

const monsters = monsterFileNames.map((fileName) => ({ fileName, actor: readJson(fileName) }));

const folderDocuments = readdirSync(MONSTERS_DIR)
	.filter((fileName) => fileName.startsWith("_folder-") && fileName.endsWith(".json"))
	.map((fileName) => readJson(fileName));

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

const SKILLS = [
	"acr",
	"ani",
	"arc",
	"ath",
	"dec",
	"his",
	"ins",
	"itm",
	"inv",
	"med",
	"nat",
	"prc",
	"prf",
	"per",
	"rel",
	"slt",
	"ste",
	"sur",
];

function expectNonEmptyString(value) {
	expect(value).toEqual(expect.any(String));
	expect(value.trim()).not.toBe("");
}

function expectKey(value, prefix, id) {
	expect(value).toBe(`${prefix}${id}`);
}

describe("load and test monster folders", () => {
	test("monsters loaded excludes folders", () => {
		expect(monsters.length).toBeGreaterThan(0);
		expect(monsterFileNames.every((fileName) => !fileName.startsWith("_folder-"))).toBe(true);
		expect(folderDocuments.length).toBeGreaterThan(0);
	});
});

describe.each(monsters)("$fileName", ({ actor }) => {
	test("has a valid actor document", () => {
		expectNonEmptyString(actor.name);
		expect(actor.type).toBe("npc");
		expect(actor._id).toMatch(/^[A-Za-z0-9]{16}$/);
		expectKey(actor._key, "!actors!", actor._id);
		expect(actor.img).toBe("modules/wc5e-foundryvtt/assets/default-token.svg");
		expect(actor._stats).toMatchObject({ systemId: "dnd5e", systemVersion: "5.3.3" });
		expect(actor.system.source).toMatchObject({ rules: "2014" });
		expectNonEmptyString(actor.system.source.book);
		expectNonEmptyString(actor.system.source.custom);
		expect(actor.items).toEqual(expect.any(Array));
		expect(actor.prototypeToken).toMatchObject({
			name: actor.name,
			texture: { src: actor.img },
		});
		expect(actor.prototypeToken.width).toBeGreaterThan(0);
		expect(actor.prototypeToken.height).toBeGreaterThan(0);
	});

	test("has valid core statblock fields", () => {
		const { system } = actor;

		expect(system.abilities).toBeDefined();
		for (const ability of ABILITIES) {
			expect(system.abilities[ability].value).toEqual(expect.any(Number));
		}

		expect(system.attributes.ac.flat).toEqual(expect.any(Number));
		expect(system.attributes.hp.value).toEqual(expect.any(Number));
		expectNonEmptyString(system.attributes.hp.formula);
		expect(system.attributes.movement).toMatchObject({ units: "ft" });
		expect(system.details).toMatchObject({
			alignment: expect.any(String),
			cr: expect.anything(),
			type: { value: expect.any(String) },
		});
		expect(system.traits).toMatchObject({
			size: expect.any(String),
			languages: expect.any(Object),
		});

		for (const skill of SKILLS) {
			expect(system.skills[skill]).toMatchObject({
				value: expect.any(Number),
				ability: expect.any(String),
			});
		}
	});

	test("has valid feature items", () => {
		const itemIds = new Set();

		for (const item of actor.items) {
			expectNonEmptyString(item.name);
			expect(["feat", "spell"]).toContain(item.type);
			expect(item._id).toMatch(/^[A-Za-z0-9]{16}$/);
			expect(itemIds.has(item._id)).toBe(false);
			itemIds.add(item._id);
			expectKey(item._key, `!actors.items!${actor._id}.`, item._id);
			expect(item.system.description.value).toEqual(expect.any(String));
			expect(item.system.activities).toEqual(expect.any(Object));
			expect(item.system.source.rules).toBe("2014");
		}
	});
});

test("has unique actor IDs and keys", () => {
	const ids = monsters.map(({ actor }) => actor._id);
	const keys = monsters.map(({ actor }) => actor._key);

	expect(new Set(ids).size).toBe(ids.length);
	expect(new Set(keys).size).toBe(keys.length);
});

test("has folder documents for every actor folder reference", () => {
	const folderIds = new Set(folderDocuments.map((folder) => folder._id));

	for (const { actor } of monsters) {
		expect(actor.folder).toEqual(expect.any(String));
		expect(folderIds.has(actor.folder)).toBe(true);
	}
});
