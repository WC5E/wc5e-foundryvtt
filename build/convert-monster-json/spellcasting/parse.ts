import { ALIAS } from "./aliases.js";

const ABILITY_FULL: Record<string, string> = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha",
};

const HEADER = /(?<cantrip>Cantrips?\s*\(at will\))|(?<lvl>(?<lvlnum>\d)(?:st|nd|rd|th)\s+level\s*\((?<slotnum>\d+)\s*slots?\))|(?<atwill>At will)|(?<perday>(?<perdaynum>\d+)\s*\/\s*day(?:\s+each)?)/gi;

interface SpellGroup {
	prep: "prepared" | "atwill" | "innate";
	level?: number | null;
	slots?: number | null;
	per_day?: number;
	names: Array<[string, string]>;
}

export interface ParsedSpellcasting {
	ability: string;
	dc: number | null;
	groups: SpellGroup[];
	dropped: string[];
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

export function parseSpellcasting(text: string): ParsedSpellcasting | null {
	const abilityMatch = /spellcasting ability is (\w+)/i.exec(text);
	if (!abilityMatch) return null;
	const ability = ABILITY_FULL[(abilityMatch[1] ?? "").toLowerCase()];
	if (!ability) return null;
	const dcMatch = /spell save DC\s*(\d+)/i.exec(text);
	const dc = dcMatch ? Number(dcMatch[1]) : null;

	const groups: SpellGroup[] = [];
	const dropped: string[] = [];
	const matches = [...text.matchAll(HEADER)];
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const start = (match.index ?? 0) + match[0].length;
		const end = matches[index + 1]?.index ?? text.length;
		const body = text.slice(start, end);
		const pairs = body.split(/[,;]/).map((name) => [displayName(name), normaliseName(name)] as [string, string]);
		const bad = ["spellcast", "following", "innately", "material component"];
		const names = pairs.filter(([, key]) => key.length >= 3 && key.length <= 45 && !key.includes(":") && !bad.some((word) => key.includes(word)));
		dropped.push(...pairs
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
	return { ability, dc, groups, dropped };
}