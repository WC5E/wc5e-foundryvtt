import { expect, test } from "vitest";

import { buildActor, SPELL_REPORT } from "../build/build-actors/actor.ts";
import { loadMonstersFromFull, renderMonsterEntries } from "../build/build-actors/source.ts";

function monster(overrides = {}) {
  return {
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
  };
}

test("adapts structured scalar fields into ParsedMonster", () => {
  const [result] = loadMonstersFromFull({ monster: [monster({
    type: { type: "undead", tags: ["dwarf"] },
    alignment: ["C", "E"],
    speed: { fly: { number: 40, condition: "(hover)" }, canHover: true },
    save: { wis: "+5" },
    skill: { perception: "+4 survival +3" },
    resist: ["fire", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks" }],
    senses: ["darkvision 60 ft."],
    passive: 14,
    languages: ["understands Common", "but can't speak"],
  })] });

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

  expect(text).toBe("Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit:23 (5d6 + 6) bludgeoning damage.\n\n- *fire bolt*\n- Note. restrained");
});

test("rejects a source root without a monster array", () => {
  expect(() => loadMonstersFromFull({})).toThrow(/monster array/i);
});

test("embeds spells from both innate and prepared synthetic traits", () => {
  SPELL_REPORT.length = 0;
  const [caster] = loadMonstersFromFull({ monster: [monster({
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
        spells: { "1": { slots: 2, spells: ["{@spell mage hand}"] } },
        ability: "int",
      },
    ],
  })] });

  const actor = buildActor(caster);
  expect(actor.items.filter((item) => item.type === "spell").map((item) => item.name).sort()).toEqual(["Fire Bolt", "Mage Hand"]);
  expect(actor.system.attributes.spellcasting).toBe("int");
  expect(actor.system.spells.spell1).toEqual({ value: 2, override: null });
  expect(SPELL_REPORT).toHaveLength(1);
  expect(SPELL_REPORT[0].slice(1, 3)).toEqual(["Mixed Caster", 2]);
  expect(SPELL_REPORT[0][3]).toEqual([]);
});