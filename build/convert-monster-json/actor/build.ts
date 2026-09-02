import { folderId, makeId } from "../ids.js";
import {
	SIZE_MAP,
	TOKEN_SIZE,
	TYPE_FOLDER,
	abilityMod,
	mapConditions,
	mapDamage,
	mapType,
	profBonus,
} from "../mappings.js";
import { embedSpellcasting, type UnmatchedSpell } from "../spellcasting/embed.js";
import type { ActorItem, ParsedMonster } from "../types.js";
import { buildAbilities, buildSkills } from "./abilities.js";
import { buildFeatItem } from "./feature-items.js";

export const DEFAULT_IMG = "modules/wc5e-foundryvtt/assets/default-token.svg";

export type SpellReportEntry = [actorId: string, name: string, matched: number, unmatched: UnmatchedSpell[]];

export interface ActorBuildResult {
	actor: Record<string, any>;
	folder: { name: string; color: string };
	spellReport: SpellReportEntry | null;
	droppedSpellFragments: string[];
}

export function sourceBook(monster: ParsedMonster): string {
	return `Warcraft 5e - Manual of Monsters${monster._wip ? " (WIP)" : ""}`;
}

export function buildActor(monster: ParsedMonster): ActorBuildResult {
	const actorId = makeId("actor", monster.name);
	const cr = monster.cr;
	const proficiencyBonus = profBonus(cr);
	const size = SIZE_MAP[monster.size] ?? "med";

	const damageVulnerabilities = mapDamage(monster.damage_vulnerabilities);
	const damageResistances = mapDamage(monster.damage_resistances);
	const damageImmunities = mapDamage(monster.damage_immunities);
	const conditionImmunities = mapConditions(monster.condition_immunities);

	const languageText = monster.languages.trim();
	const languageCustom = ["", "—", "-", "none", "None"].includes(languageText)
		? ""
		: languageText.split(",").map((part) => part.trim()).filter(Boolean).join("; ");

	const speed = monster.speed;
	const senses = monster.senses;
	const items: ActorItem[] = [];
	let sort = 100000;
	for (const feat of monster.traits) {
		items.push(buildFeatItem(actorId, feat, "trait", sort));
		sort += 100000;
	}
	for (const feat of monster.actions) {
		items.push(buildFeatItem(actorId, feat, "action", sort));
		sort += 100000;
	}
	for (const feat of monster.reactions) {
		items.push(buildFeatItem(actorId, feat, "reaction", sort));
		sort += 100000;
	}

	let legactMax = 0;
	for (const feat of monster.legendary) {
		if (!feat.name) {
			const match = /take\s+(\d+)\s+legendary/i.exec(feat.text);
			if (match) {
 legactMax = Number(match[1]); 
}
			continue;
		}
		items.push(buildFeatItem(actorId, feat, "legendary", sort));
		sort += 100000;
	}

	const book = sourceBook(monster);
	const system = {
		abilities: buildAbilities(monster, proficiencyBonus),
		attributes: {
			ac: { flat: monster.ac, calc: "natural", formula: "" },
			hp: { value: monster.hp, max: monster.hp, temp: 0, tempmax: 0, formula: monster.hp_formula },
			init: { ability: "", bonus: "0", roll: { min: null, max: null, mode: 0 } },
			movement: {
				burrow: speed.burrow ?? 0,
				climb: speed.climb ?? 0,
				fly: speed.fly ?? 0,
				swim: speed.swim ?? 0,
				walk: speed.walk ?? 0,
				bonus: "",
				special: "",
				units: "ft",
				hover: Boolean(speed.hover ?? false),
			},
			attunement: { max: 3 },
			senses: {
				ranges: {
					darkvision: senses.darkvision || null,
					blindsight: senses.blindsight || null,
					tremorsense: senses.tremorsense || null,
					truesight: senses.truesight || null,
				},
				units: "ft",
				special: "",
			},
			spellcasting: "",
			exhaustion: 0,
			concentration: { ability: "", roll: { min: null, max: null, mode: 0 }, bonuses: { save: "" }, limit: 1 },
			hd: { spent: 0 },
			death: { ability: "", roll: { min: null, max: null, mode: 0 }, success: 0, failure: 0 },
		},
		details: {
			biography: { value: "", public: "" },
			alignment: titleCase(monster.alignment || ""),
			race: null,
			type: mapType(monster),
			cr,
			spellLevel: 0,
		},
		traits: {
			size,
			di: damageImmunities,
			dr: damageResistances,
			dv: damageVulnerabilities,
			ci: conditionImmunities,
			languages: { value: [], custom: languageCustom },
			dm: { amount: {}, bypasses: [] },
		},
		skills: buildSkills(monster, proficiencyBonus),
		tools: {},
		resources: {
			legact: { value: legactMax, max: legactMax },
			legres: { value: 0, max: 0 },
			lair: { value: false, initiative: null },
		},
		source: { custom: book, book, page: "", license: "", revision: 1, rules: "2014" },
	};

	const tokenSize = TOKEN_SIZE[size] ?? 1;
	const prototype = {
		name: monster.name,
		displayName: 20,
		actorLink: false,
		width: tokenSize,
		height: tokenSize,
		disposition: -1,
		displayBars: 20,
		bar1: { attribute: "attributes.hp" },
		bar2: { attribute: null },
		texture: { src: DEFAULT_IMG },
		sight: { enabled: false, range: 0 },
	};

	const actor: Record<string, any> = {
		_id: actorId,
		name: monster.name,
		type: "npc",
		img: DEFAULT_IMG,
		system,
		prototypeToken: prototype,
		items,
		effects: [],
		folder: null,
		sort: 0,
		ownership: { default: 0 },
		flags: {},
		_stats: { systemId: "dnd5e", systemVersion: "5.3.3" },
		_key: `!actors!${actorId}`,
	};

	const typeValue = actor.system.details.type.value;
	const [folderName, folderColor] = TYPE_FOLDER[typeValue] ?? ["Other", "#555555"];
	actor.folder = folderId("Actor", folderName);

	const spellResult = embedSpellcasting(actor, monster, actorId, proficiencyBonus, abilityMod);

	return {
		actor,
		folder: { name: folderName, color: folderColor },
		spellReport: spellResult.matched || spellResult.unmatched.length
			? [actorId, monster.name, spellResult.matched, spellResult.unmatched]
			: null,
		droppedSpellFragments: spellResult.dropped,
	};
}

function titleCase(value: string): string {
	return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}