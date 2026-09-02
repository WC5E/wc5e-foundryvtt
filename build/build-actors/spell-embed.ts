import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { makeId } from "./ids.js";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(.:)/, "$1");
const REPO = path.resolve(HERE, "..", "..");

export const ALIAS: Record<string, string> = {
	"call lighting": "call lightning",
	"lighting blast": "lightning blast",
	"produce flames": "produce flame",
	"produce flame": "produce flame",
	"detect poison and decease": "detect poison and disease",
	"locate animals and plants": "locate animals or plants",
	"ray of sickeness": "ray of sickness",
	"maximilians earthen grasp": "maximilian's earthen grasp",
	"crusaders mantle": "crusader's mantle",
	"thunder wave": "thunderwave",
	"prot. from evil and good": "protection from evil and good",
	"thunder step ^xge": "thunder step",
	"summon shadow- spawn": "summon shadowspawn",
	"tasha's otherworldy guise": "tasha's otherworldly guise",
};

const ABILITY_FULL: Record<string, string> = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha",
};

const HEADER = /(?<cantrip>Cantrips?\s*\(at will\))|(?<lvl>(?<lvlnum>\d)(?:st|nd|rd|th)\s+level\s*\((?<slotnum>\d+)\s*slots?\))|(?<atwill>At will)|(?<perday>(?<perdaynum>\d+)\s*\/\s*day(?:\s+each)?)/gi;

export const DROPPED: string[] = [];

interface SpellIndexEntry {
	name: string;
	img?: string | null;
	system: Record<string, any>;
	src: "custom" | "srd";
}

interface SpellGroup {
	prep: "prepared" | "atwill" | "innate";
	level?: number | null;
	slots?: number | null;
	per_day?: number;
	names: Array<[string, string]>;
}

interface ParsedSpellcasting {
	ability: string;
	dc: number | null;
	groups: SpellGroup[];
}

export interface UnmatchedSpell {
	name: string;
	key: string;
	prep: string;
	level: number | null;
	perDay: number | null;
}

let customIndex: Record<string, SpellIndexEntry> | null = null;
let srdIndex: Record<string, SpellIndexEntry> | null = null;

function readJson(filePath: string): any {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

export function displayName(name: string): string {
	let output = name.replace(/\^[A-Za-z]+\^?/g, "");
	output = output.replace(/\u2726/g, "").replace(/\*/g, "");
	output = output.replace(/<\/?br\s*\/?>/g, "");
	output = output.replace(/\s+/g, " ");
	return output.replace(/^[ .:;-]+/, "").replace(/[ .:;-]+$/, "");
}

export function normaliseName(name: string): string {
	let output = name.toLowerCase();
	output = output.replace(/\^[a-z]+\^/g, "");
	output = output.replace(/\u2726/g, "").replace(/\*/g, "");
	output = output.replace(/\([^)]*\)/g, "");
	output = output.replace(/<\/?br\s*\/?>/g, "");
	output = output.replace(/[\uFEFF\u200B\u200C\u200D]/g, "");
	output = output.replace(/\s+/g, " ");
	output = output.replace(/^[ .:;-]+/, "").replace(/[ .:;-]+$/, "");
	return Object.prototype.hasOwnProperty.call(ALIAS, output) ? ALIAS[output] : output;
}

export function loadIndexes(): [Record<string, SpellIndexEntry>, Record<string, SpellIndexEntry>] {
	if (customIndex && srdIndex) return [customIndex, srdIndex];

	customIndex = {};
	const spellsDir = path.join(REPO, "src", "generated", "spells");
	for (const fileName of readdirSync(spellsDir)) {
		if (!fileName.endsWith(".json") || fileName.startsWith("_folder-")) continue;
		const document = readJson(path.join(spellsDir, fileName));
		customIndex[normaliseName(document.name)] = {
			name: document.name,
			img: document.img,
			system: document.system,
			src: "custom",
		};
	}

	srdIndex = {};
	const raw = readJson(path.join(REPO, "reference", "srd-index", "srd_spells_2014.json"));
	for (const [key, value] of Object.entries(raw) as Array<[string, any]>) {
		srdIndex[normaliseName(key)] = {
			name: value.name,
			img: value.img,
			system: value.system,
			src: "srd",
		};
	}

	return [customIndex, srdIndex];
}

export function parseSpellcasting(text: string): ParsedSpellcasting | null {
	const abilityMatch = /spellcasting ability is (\w+)/i.exec(text);
	if (!abilityMatch) return null;
	const ability = ABILITY_FULL[(abilityMatch[1] ?? "").toLowerCase()];
	if (!ability) return null;
	const dcMatch = /spell save DC\s*(\d+)/i.exec(text);
	const dc = dcMatch ? Number(dcMatch[1]) : null;

	const groups: SpellGroup[] = [];
	const matches = [...text.matchAll(HEADER)];
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const start = (match.index ?? 0) + match[0].length;
		const end = matches[index + 1]?.index ?? text.length;
		const body = text.slice(start, end);
		const pairs = body.split(/[,;]/).map((name) => [displayName(name), normaliseName(name)] as [string, string]);
		const bad = ["spellcast", "following", "innately", "material component"];
		const names = pairs.filter(([, key]) => key.length >= 3 && key.length <= 45 && !key.includes(":") && !bad.some((word) => key.includes(word)));
		DROPPED.push(...pairs
			.filter(([, key]) => key.includes(":") && key.length >= 3 && key.length <= 45 && !bad.some((word) => key.includes(word)))
			.map(([, key]) => key));
		if (!names.length) continue;

		const matchGroups = match.groups ?? {};
		if (matchGroups.cantrip) {
			groups.push({ prep: "prepared", level: 0, slots: null, names });
		} else if (matchGroups.lvl) {
			groups.push({ prep: "prepared", level: Number(matchGroups.lvlnum), slots: Number(matchGroups.slotnum), names });
		} else if (matchGroups.atwill) {
			groups.push({ prep: "atwill", level: null, slots: null, names });
		} else if (matchGroups.perday) {
			groups.push({ prep: "innate", per_day: Number(matchGroups.perdaynum), level: null, slots: null, names });
		}
	}
	return { ability, dc, groups };
}

function embedItem(actorId: string, entry: SpellIndexEntry, prep: string, perDay: number | undefined, sort: number) {
	const itemId = makeId(actorId, "spell", entry.name);
	const system = deepClone(entry.system);
	system.preparation = { mode: prep, prepared: prep === "prepared" };
	if (prep === "innate" && perDay) {
		system.uses = { max: String(perDay), spent: 0, recovery: [{ period: "day", type: "recoverAll" }] };
	}
	if (!system.source) system.source = {};
	return {
		_id: itemId,
		name: entry.name,
		type: "spell",
		img: entry.img || "icons/svg/daze.svg",
		system,
		effects: [],
		folder: null,
		sort,
		ownership: { default: 0 },
		flags: {},
		_stats: { systemId: "dnd5e", systemVersion: "5.3.3" },
		_key: `!actors.items!${actorId}.${itemId}`,
	};
}

export function embedSpellcasting(
	actor: Record<string, any>,
	monster: Record<string, any>,
	actorId: string,
	prof: number,
	abilityMod: (score: number) => number,
): [number, UnmatchedSpell[]] {
	const trait = (monster.traits as Array<{ name: string; text: string }>).find((entry) => entry.name.toLowerCase().includes("spellcasting"));
	if (!trait) return [0, []];

	const parsed = parseSpellcasting(trait.text);
	if (!parsed) return [0, []];

	const [custom, srd] = loadIndexes();
	const ability = parsed.ability;
	actor.system.attributes.spellcasting = ability;

	const slots: Record<string, { value: number; override: null }> = {};
	for (const group of parsed.groups) {
		if (group.prep === "prepared" && group.level && group.slots) {
			slots[`spell${group.level}`] = { value: group.slots, override: null };
		}
	}
	if (Object.keys(slots).length) actor.system.spells = slots;

	if (parsed.dc !== null) {
		const derived = 8 + prof + abilityMod(monster.abilities[ability] ?? 10);
		const delta = parsed.dc - derived;
		actor.system.bonuses ??= {};
		actor.system.bonuses.spell = { dc: delta ? String(delta) : "" };
	}

	let matched = 0;
	const unmatched: UnmatchedSpell[] = [];
	const seen = new Set<string>();
	let sort = 200000;
	for (const group of parsed.groups) {
		for (const [raw, name] of group.names) {
			if (seen.has(name)) continue;
			seen.add(name);
			const entry = custom[name] ?? srd[name];
			if (!entry) {
				unmatched.push({
					name: raw,
					key: name,
					prep: group.prep,
					level: group.level ?? null,
					perDay: group.per_day ?? null,
				});
				continue;
			}
			actor.items.push(embedItem(actorId, entry, group.prep, group.per_day, sort));
			sort += 1000;
			matched += 1;
		}
	}
	return [matched, unmatched];
}