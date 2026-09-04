import { expect, test } from "vitest";

import { parseAttackText, parseDamageParts, parseSaveText } from "../../build/convert-monster-json/actor/activities.js";
import { buildActor } from "../../build/convert-monster-json/actor/build.js";
import { buildFeatItem } from "../../build/convert-monster-json/actor/feature-items.js";
import { convertMonsters } from "../../build/convert-monster-json/main.js";
import { loadMonstersFromFull } from "../../build/convert-monster-json/source/load.js";
import { renderMonsterEntries, renderMonsterTextStructured } from "../../build/convert-monster-json/source/render.js";

const mockMonsterAttributes = (overrides = {}) => ({
	name: "Ancient Protector",
	size: ["H"],
	type: "plant",
	alignment: ["N", "G"],
	ac: [{ ac: 15, from: ["natural armor"] }],
	hp: { average: 105, formula: "10d12 + 40" },
	speed: { walk: 30 },
	str: 21,
	dex: 8,
	con: 19,
	int: 12,
	wis: 16,
	cha: 12,
	cr: "6",
	...overrides,
});

test("adapts structured scalar fields into ParsedMonster", () => {
	const [result] = loadMonstersFromFull({
		monster: [
			mockMonsterAttributes({
				type: { type: "undead", tags: ["dwarf"] },
				alignment: ["C", "E"],
				speed: { fly: { number: 40, condition: "(hover)" }, canHover: true },
				save: { wis: "+5" },
				skill: { perception: "+4 survival +3" },
				resist: ["fire", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks" }],
				senses: ["darkvision 60 ft."],
				passive: 14,
				languages: ["understands Common", "but can't speak"],
			}),
		],
	});

	expect(result).toMatchObject({
		size: "huge",
		type: "undead",
		subtype: "dwarf",
		alignment: "chaotic evil",
		ac: 15,
		hp: 105,
		hp_formula: "10d12 + 40",
		speed: { walk: 0, fly: 40, hover: true },
		abilities: { str: 21, wis: 16 },
		saves: { wis: 5 },
		skills: { prc: 4, sur: 3 },
		damage_resistances: "fire; bludgeoning, piercing, slashing; from nonmagical attacks",
		senses: { darkvision: 60, passive: 14, special: "" },
		languages: "understands Common, but can't speak",
		cr: 6,
	});
});

test("renders tagged attacks and nested lists for the existing activity parser", () => {
	const text = renderMonsterEntries([
		"{@atk mw} {@hit 10} to hit, reach 5 ft., one target. {@h}23 ({@damage 5d6 + 6}) bludgeoning damage.",
		{ type: "list", items: ["{@i {@spell fire bolt}}", { name: "Note", entries: ["{@condition restrained}"] }] },
	]);

	expect(text).toBe(
		"<em>Melee Weapon Attack:</em> +10 to hit, reach 5 ft., one target. <em>Hit:</em>23 ([[/damage 5d6 + 6 bludgeoning]]).\n\n- *fire bolt*\n- Note. restrained",
	);
});

test("renders status tags as condition references", () => {
	expect(renderMonsterEntries(["The caster is {@status concentration}."])).toBe(
		"The caster is &Reference[condition=concentration].",
	);
	expect(renderMonsterEntries(["{@status poisoned} and {@status restrained}"])).toBe(
		"&Reference[condition=poisoned] and &Reference[condition=restrained]",
	);
});

test("retains structured attack and typed damage metadata", () => {
	const rendered = renderMonsterTextStructured(
		"{@atk mw} {@hit 6} to hit. {@h}7 ({@damage 1d8 + 3}) piercing damage",
	);

	expect(rendered.text).toBe(
		"<em>Melee Weapon Attack:</em> +6 to hit. <em>Hit:</em>7 ([[/damage 1d8 + 3 piercing]])",
	);
	expect(rendered.macros).toEqual([
		{ kind: "attack", data: { attackType: "melee", classification: "weapon", code: "mw" } },
		{ kind: "hit", data: { bonus: "6" } },
		{ kind: "hit", data: { boundary: true } },
		{ kind: "damage", data: { formula: "1d8 + 3", type: "piercing" } },
	]);
});

test("parses attack, damage, and save text into explicit values", () => {
	const attack = parseAttackText("Ranged Spell Attack: +7 to hit, range 60 ft., one target.");
	const damage = parseDamageParts("Hit: 12 (2d8 + 3) fire damage.");
	const save = parseSaveText("DC 15 Dexterity saving throw, taking 10 (3d6) cold damage on a failed save.");

	expect(attack).toMatchObject({
		attackType: "ranged",
		classification: "spell",
		bonus: "7",
		range: { value: "60", units: "ft" },
	});
	expect(damage[0]).toMatchObject({ number: 2, denomination: 8, bonus: "3", types: ["fire"] });
	expect(parseDamageParts("17 (2d10 + 6) piercing damage")[0]).toMatchObject({
		number: 2,
		denomination: 10,
		bonus: "6",
		types: ["piercing"],
	});
	expect(parseDamageParts("17 ([[/damage 2d10 + 6 piercing]])")[0]).toMatchObject({
		number: 2,
		denomination: 10,
		bonus: "6",
		types: ["piercing"],
	});
	expect(parseDamageParts("7 ([[/damage 1d8 + 3 piercing]])")[0]).toMatchObject({
		number: 1,
		denomination: 8,
		bonus: "3",
		types: ["piercing"],
	});
	expect(save).toMatchObject({ dc: "15", ability: "dex", onSave: "half" });
});

test("falls back to a utility activity and preserves action costs", () => {
	const item = buildFeatItem("actor-id", { name: "Roar", text: "Each creature hears the roar." }, "action", 100000);
	const activity = Object.values(item.system.activities)[0];

	expect(activity).toMatchObject({ type: "utility", activation: { type: "action", value: 1 } });

	const costlyItem = buildFeatItem("actor-id", { name: "Recharge", text: "Costs 2 actions." }, "action", 200000);
	const costlyActivity = Object.values(costlyItem.system.activities)[0];
	expect(costlyActivity).toMatchObject({ type: "utility", activation: { type: "action", value: 2 } });
});

test("aggregates converted actors and disambiguates duplicate slugs", () => {
	const [first] = loadMonstersFromFull({ monster: [mockMonsterAttributes()] });
	const second = { ...first, type: "undead" };
	const result = convertMonsters([first, second]);

	expect(result.actors.map(({ slug }) => slug)).toEqual(["ancient-protector", "ancient-protector-1"]);
	expect(result.actors).toHaveLength(2);
	expect(Object.keys(result.folders)).toHaveLength(2);
	expect(result.spellReport).toEqual([]);
});

test("rejects a source root without a monster array", () => {
	expect(() => loadMonstersFromFull({})).toThrow(/monster array/i);
});

test("embeds spells from both innate and prepared synthetic traits", () => {
	const [caster] = loadMonstersFromFull({
		monster: [
			mockMonsterAttributes({
				name: "Mixed Caster",
				spellcasting: [
					{
						name: "Innate Spellcasting",
						headerEntries: ["The caster's spellcasting ability is Charisma (spell save {@dc 13})."],
						will: ["{@spell fire bolt}"],
						ability: "cha",
					},
					{
						name: "Spellcasting",
						headerEntries: ["The caster's spellcasting ability is Intelligence (spell save {@dc 14})."],
						spells: { 1: { slots: 2, spells: ["{@spell mage hand}"] } },
						ability: "int",
					},
				],
			}),
		],
	});

	const result = buildActor(caster);
	const actor = result.actor;
	expect(
		actor.items
			.filter((item) => item.type === "spell")
			.map((item) => item.name)
			.sort(),
	).toEqual(["Fire Bolt", "Mage Hand"]);
	expect(actor.system.attributes.spellcasting).toBe("int");
	expect(actor.system.spells.spell1).toEqual({ value: 2, override: null });
	expect(result.spellReport?.slice(1, 3)).toEqual(["Mixed Caster", 2]);
	expect(result.spellReport?.[3]).toEqual([]);
});
