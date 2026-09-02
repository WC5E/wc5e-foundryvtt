export const SIZE_MAP: Record<string, string> = {
	tiny: "tiny",
	small: "sm",
	medium: "med",
	large: "lg",
	huge: "huge",
	gargantuan: "grg",
};

export const TOKEN_SIZE: Record<string, number> = {
	tiny: 1,
	sm: 1,
	med: 1,
	lg: 2,
	huge: 3,
	grg: 4,
};

export const TYPE_FOLDER: Record<string, [string, string]> = {
	aberration: ["Aberrations", "#6b3fa0"],
	beast: ["Beasts", "#6b8e23"],
	celestial: ["Celestials", "#d4af37"],
	construct: ["Constructs", "#8a8a8a"],
	dragon: ["Dragons", "#b22222"],
	elemental: ["Elementals", "#1e90ff"],
	fey: ["Fey", "#c71585"],
	fiend: ["Fiends", "#8b0000"],
	giant: ["Giants", "#8b5a2b"],
	humanoid: ["Humanoids", "#4682b4"],
	monstrosity: ["Monstrosities", "#556b2f"],
	ooze: ["Oozes", "#6b8e23"],
	plant: ["Plants", "#2e8b57"],
	undead: ["Undead", "#4b0082"],
};

export const CREATURE_TYPES = new Set([
	"aberration",
	"beast",
	"celestial",
	"construct",
	"dragon",
	"elemental",
	"fey",
	"fiend",
	"giant",
	"humanoid",
	"monstrosity",
	"ooze",
	"plant",
	"undead",
]);

export const DAMAGE_TYPES = [
	"acid",
	"bludgeoning",
	"cold",
	"fire",
	"force",
	"lightning",
	"necrotic",
	"piercing",
	"poison",
	"psychic",
	"radiant",
	"slashing",
	"thunder",
] as const;

export const CONDITION_STEMS: Record<string, string> = {
	blind: "blinded",
	charm: "charmed",
	deaf: "deafened",
	exhaust: "exhaustion",
	fright: "frightened",
	grappl: "grappled",
	incapacit: "incapacitated",
	invisib: "invisible",
	paraly: "paralyzed",
	petrif: "petrified",
	pretrif: "petrified",
	poison: "poisoned",
	prone: "prone",
	restrain: "restrained",
	stun: "stunned",
	unconsci: "unconscious",
	diseas: "diseased",
};

export const ABILITY_NAME: Record<string, string> = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha",
};

export const SKILL_ABILITY: Record<string, string> = {
	acr: "dex",
	ani: "wis",
	arc: "int",
	ath: "str",
	dec: "cha",
	his: "int",
	ins: "wis",
	itm: "cha",
	inv: "int",
	med: "wis",
	nat: "int",
	prc: "wis",
	prf: "cha",
	per: "cha",
	rel: "int",
	slt: "dex",
	ste: "dex",
	sur: "wis",
};

export interface DamageMapping {
	value: string[];
	bypasses: string[];
	custom: string;
}

export interface ConditionMapping {
	value: string[];
	custom: string;
}

export interface CreatureTypeInput {
	type?: string | null;
	subtype?: string | null;
}

export interface CreatureTypeMapping {
	value: string;
	subtype?: string | null;
	swarm: string;
	custom: string;
}

export function profBonus(cr: number | null | undefined): number {
	if (cr == null) return 2;
	if (cr < 5) return 2;
	if (cr < 9) return 3;
	if (cr < 13) return 4;
	if (cr < 17) return 5;
	if (cr < 21) return 6;
	if (cr < 25) return 7;
	if (cr < 29) return 8;
	return 9;
}

export function abilityMod(score: number): number {
	return Math.floor((score - 10) / 2);
}

export function mdToHtml(text?: string | null): string {
	let output = text ?? "";
	output = output.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
	output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
	output = output.trim();
	return output ? `<p>${output}</p>` : "";
}

export function mapDamage(raw?: string | null): DamageMapping {
	if (!raw) return { value: [], bypasses: [], custom: "" };
	const text = raw.toLowerCase();
	const bypasses: string[] = [];
	if (text.includes("nonmagical") || text.includes("non-magical")) bypasses.push("mgc");
	if (text.includes("silver")) bypasses.push("sil");
	if (text.includes("adamantine")) bypasses.push("ada");

	const seen = new Set<string>();
	const value = DAMAGE_TYPES.filter((damageType) => {
		if (!new RegExp(`\\b${damageType}`).test(text)) return false;
		if (seen.has(damageType)) return false;
		seen.add(damageType);
		return true;
	});
	return { value, bypasses, custom: value.length ? "" : raw };
}

export function mapConditions(raw?: string | null): ConditionMapping {
	if (!raw) return { value: [], custom: "" };
	const text = raw.toLowerCase();
	const value: string[] = [];
	for (const [stem, key] of Object.entries(CONDITION_STEMS)) {
		if (text.includes(stem) && !value.includes(key)) value.push(key);
	}
	return { value, custom: value.length ? "" : raw };
}

export function normCreatureType(word: string): string | null {
	const value = word.trim().toLowerCase();
	if (CREATURE_TYPES.has(value)) return value;
	if (value.endsWith("s") && CREATURE_TYPES.has(value.slice(0, -1))) return value.slice(0, -1);
	return null;
}

export function mapType(monster: CreatureTypeInput): CreatureTypeMapping {
	const rawType = monster.type ?? "";
	const text = rawType.trim().toLowerCase();
	const swarmMatch = /^swarm of (\w+)\s+(\w+)/.exec(text);
	if (swarmMatch) {
		const swarmSize = SIZE_MAP[swarmMatch[1] ?? ""] ?? "tiny";
		const inner = normCreatureType(swarmMatch[2] ?? "");
		if (inner) return { value: inner, subtype: monster.subtype, swarm: swarmSize, custom: "" };
		return {
			value: "custom",
			subtype: monster.subtype,
			swarm: swarmSize,
			custom: titleCase(swarmMatch[2] ?? ""),
		};
	}

	const canonical = normCreatureType(text);
	if (canonical) return { value: canonical, subtype: monster.subtype, swarm: "", custom: "" };
	return { value: "custom", subtype: monster.subtype, swarm: "", custom: titleCase(rawType) };
}

function titleCase(value: string): string {
	return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}