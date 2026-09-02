import type {
	MonsterFeature,
	MonsterSourceDefense,
	MonsterSourceEntry,
	MonsterSourceEntryContent,
	MonsterSourceMovement,
	MonsterSourceRecord,
	MonsterSourceRoot,
	ParsedMonster,
} from "./types.js";

const SIZE_CODES: Record<string, string> = {
	T: "tiny",
	S: "small",
	M: "medium",
	L: "large",
	H: "huge",
	G: "gargantuan",
};

const ALIGNMENT_CODES: Record<string, string> = {
	L: "lawful",
	N: "neutral",
	C: "chaotic",
	G: "good",
	E: "evil",
	U: "unaligned",
	A: "any alignment",
};

const SKILL_KEYS: Record<string, string> = {
	acrobatics: "acr",
	animalhandling: "ani",
	arcana: "arc",
	athletics: "ath",
	deception: "dec",
	history: "his",
	insight: "ins",
	intimidation: "itm",
	investigation: "inv",
	medicine: "med",
	nature: "nat",
	perception: "prc",
	performance: "prf",
	persuasion: "per",
	religion: "rel",
	sleightofhand: "slt",
	stealth: "ste",
	survival: "sur",
};

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;

export function loadMonstersFromFull(source: unknown): ParsedMonster[] {
	if (!isMonsterSourceRoot(source)) {
		throw new Error("wc5e-mom-full.json must contain a monster array");
	}
	return source.monster.map(adaptMonster);
}

function isMonsterSourceRoot(source: unknown): source is MonsterSourceRoot {
	return typeof source === "object" && source !== null && Array.isArray((source as { monster?: unknown }).monster);
}

function adaptMonster(monster: MonsterSourceRecord): ParsedMonster {
	const name = requireString(monster.name, "name", "unknown monster");
	return {
		name,
		size: adaptSize(monster, name),
		...adaptType(monster, name),
		alignment: adaptAlignment(monster, name),
		...adaptAc(monster, name),
		...adaptHp(monster, name),
		speed: adaptSpeed(monster.speed, name),
		abilities: adaptAbilities(monster, name),
		saves: adaptTotals(monster.save, name, "save"),
		skills: adaptSkills(monster.skill, name),
		damage_vulnerabilities: adaptDefense(monster.vulnerable, "vulnerable", name),
		damage_resistances: adaptDefense(monster.resist, "resist", name),
		damage_immunities: adaptDefense(monster.immune, "immune", name),
		condition_immunities: (monster.conditionImmune ?? []).join(", "),
		senses: adaptSenses(monster.senses, monster.passive, name),
		languages: (monster.languages ?? []).join(", "),
		cr: adaptCr(monster.cr, name),
		traits: adaptFeatures(monster.trait),
		actions: adaptFeatures(monster.action),
		reactions: adaptFeatures(monster.reaction),
		legendary: adaptFeatures(monster.legendary),
	};
}

function adaptSize(monster: MonsterSourceRecord, name: string): string {
	const code = monster.size[0];
	const size = code ? SIZE_CODES[code] : undefined;
	if (!size) throw new Error(`${name}: unsupported size ${String(code)}`);
	return size;
}

function adaptType(monster: MonsterSourceRecord, name: string): Pick<ParsedMonster, "type" | "subtype"> {
	if (typeof monster.type === "string") return { type: monster.type, subtype: "" };
	const type = monster.type.type;
	if (!type) throw new Error(`${name}: missing creature type`);
	return { type, subtype: (monster.type.tags ?? []).join(", ") };
}

function adaptAlignment(monster: MonsterSourceRecord, name: string): string {
	const values = monster.alignment.map((code) => ALIGNMENT_CODES[code]);
	if (values.some((value) => !value)) throw new Error(`${name}: unsupported alignment ${monster.alignment.join(", ")}`);
	return values.join(" ");
}

function adaptAc(monster: MonsterSourceRecord, name: string): Pick<ParsedMonster, "ac"> {
	const value = monster.ac[0];
	if (typeof value === "number") return { ac: value };
	if (!value || typeof value.ac !== "number") throw new Error(`${name}: missing numeric AC`);
	return { ac: value.ac };
}

function adaptHp(monster: MonsterSourceRecord, name: string): Pick<ParsedMonster, "hp" | "hp_formula"> {
	if (typeof monster.hp.average !== "number") throw new Error(`${name}: missing numeric HP average`);
	if (typeof monster.hp.formula !== "string") throw new Error(`${name}: missing HP formula`);
	return { hp: monster.hp.average, hp_formula: monster.hp.formula };
}

function adaptSpeed(speed: MonsterSourceRecord["speed"], name: string): Record<string, number | boolean> {
	const output: Record<string, number | boolean> = { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, hover: Boolean(speed.canHover) };
	for (const kind of ["walk", "fly", "swim", "climb", "burrow"] as const) {
		const value = speed[kind];
		if (value === undefined) continue;
		output[kind] = adaptMovement(value, `${name}: ${kind}`);
		if (typeof value === "object" && value.condition?.toLowerCase().includes("hover")) output.hover = true;
	}
	return output;
}

function adaptMovement(value: number | MonsterSourceMovement, field: string): number {
	const number = typeof value === "number" ? value : value.number;
	if (!Number.isFinite(number)) throw new Error(`${field} must be numeric`);
	return number;
}

function adaptAbilities(monster: MonsterSourceRecord, name: string): Record<string, number> {
	return Object.fromEntries(ABILITIES.map((ability) => {
		const value = monster[ability];
		if (!Number.isFinite(value)) throw new Error(`${name}: ${ability} must be numeric`);
		return [ability, value];
	}));
}

function adaptTotals(totals: Record<string, string> | undefined, name: string, field: string): Record<string, number> {
	return Object.fromEntries(Object.entries(totals ?? {}).map(([key, value]) => [key, parseTotal(value, `${name}: ${field}.${key}`)]));
}

function adaptSkills(skills: Record<string, string> | undefined, name: string): Record<string, number> {
	const output: Record<string, number> = {};
	for (const [skill, value] of Object.entries(skills ?? {})) {
		const initial = /^[+-]?\s*\d+/.exec(value);
		if (!initial) throw new Error(`${name}: skill.${skill} must begin with a numeric total`);
		addSkill(output, skill, initial[0], name);
		const remaining = value.slice(initial[0].length);
		for (const match of remaining.matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+-]?\s*\d+)/g)) {
			addSkill(output, match[1], match[2], name);
		}
	}
	return output;
}

function addSkill(output: Record<string, number>, skill: string, value: string, name: string): void {
	const sourceSkill = skill.trim().toLowerCase().replace(/[^a-z]/g, "");
	const key = SKILL_KEYS[sourceSkill];
	if (!key) throw new Error(`${name}: unsupported skill ${skill}`);
	if (Object.prototype.hasOwnProperty.call(output, key)) throw new Error(`${name}: duplicate skill ${skill}`);
	output[key] = parseTotal(value, `${name}: skill.${skill}`);
}

function parseTotal(value: string, field: string): number {
	const total = Number(value.replace(/\s+/g, ""));
	if (!Number.isFinite(total)) throw new Error(`${field} must be numeric`);
	return total;
}

function adaptDefense(values: MonsterSourceDefense[] | undefined, kind: "vulnerable" | "resist" | "immune", name: string): string {
	return (values ?? []).map((value) => {
		if (typeof value === "string") return value;
		const defenses = value[kind];
		if (!defenses?.length) throw new Error(`${name}: malformed ${kind} defense`);
		return `${defenses.join(", ")}${value.note ? `; ${value.note}` : ""}`;
	}).join("; ");
}

function adaptSenses(values: string[] | undefined, passive: number | undefined, name: string): Record<string, number | string> {
	if (passive !== undefined && !Number.isFinite(passive)) throw new Error(`${name}: passive perception must be numeric`);
	const output: Record<string, number | string> = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0, passive: passive ?? 0, special: "" };
	const unparsed: string[] = [];
	for (const value of values ?? []) {
		const match = /^(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*f(?:t|eet)\.?/i.exec(value);
		if (!match) {
			unparsed.push(value);
			continue;
		}
		output[match[1].toLowerCase()] = Number(match[2]);
	}
	output.special = unparsed.join(", ");
	return output;
}

function adaptCr(cr: MonsterSourceRecord["cr"], name: string): number {
	const value = typeof cr === "string" ? cr : cr.cr;
	if (!value) throw new Error(`${name}: missing CR`);
	const [numerator, denominator] = value.split("/").map(Number);
	const result = denominator ? numerator / denominator : numerator;
	if (!Number.isFinite(result)) throw new Error(`${name}: invalid CR ${value}`);
	return result;
}

function adaptFeatures(entries: MonsterSourceEntry[] | undefined): MonsterFeature[] {
	return (entries ?? []).map((entry) => ({ name: entry.name, text: renderEntry(entry.entries ?? []) }));
}

function renderEntry(entries: MonsterSourceEntryContent[]): string {
	return entries.map((entry) => {
		if (typeof entry === "string") return stripTag(entry);
		if (entry.type === "list") return renderEntry(entry.items ?? []);
		const heading = entry.name ? `${entry.name}. ` : "";
		return `${heading}${renderEntry(entry.entries ?? [])}`;
	}).filter(Boolean).join("\n\n");
}

function stripTag(value: string): string {
	return value.replace(/\{@\w+ ([^}|]+)(?:\|[^}]*)?}/g, "$1");
}

function requireString(value: unknown, field: string, name: string): string {
	if (typeof value !== "string" || !value) throw new Error(`${name}: ${field} must be a non-empty string`);
	return value;
}