import { CONDITION_STEMS, CREATURE_TYPES, DAMAGE_TYPES, SIZE_MAP } from "../constants.js";

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

export const profBonus = (cr: number | null | undefined): number => {
	if (cr == null) {
		return 2;
	}
	if (cr < 5) {
		return 2;
	}
	if (cr < 9) {
		return 3;
	}
	if (cr < 13) {
		return 4;
	}
	if (cr < 17) {
		return 5;
	}
	if (cr < 21) {
		return 6;
	}
	if (cr < 25) {
		return 7;
	}
	if (cr < 29) {
		return 8;
	}
	return 9;
};

export const abilityMod = (score: number): number => {
	return Math.floor((score - 10) / 2);
};

export const mdToHtml = (text?: string | null): string => {
	let output = text ?? "";
	output = output.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
	output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
	output = output.trim();
	return output ? `<p>${output}</p>` : "";
};

export const mapDamage = (raw?: string | null): DamageMapping => {
	if (!raw) {
		return { value: [], bypasses: [], custom: "" };
	}
	const text = raw.toLowerCase();
	const bypasses: string[] = [];

	if (text.includes("nonmagical") || text.includes("non-magical")) {
		bypasses.push("mgc");
	}
	if (text.includes("silver")) {
		bypasses.push("sil");
	}
	if (text.includes("adamantine")) {
		bypasses.push("ada");
	}

	const seen = new Set<string>();

	const value = DAMAGE_TYPES.filter((damageType) => {
		if (!new RegExp(`\\b${damageType}`).test(text)) {
			return false;
		}
		if (seen.has(damageType)) {
			return false;
		}
		seen.add(damageType);
		return true;
	});

	return { value, bypasses, custom: value.length ? "" : raw };
};

export const mapConditions = (raw?: string | null): ConditionMapping => {
	if (!raw) {
		return { value: [], custom: "" };
	}

	const text = raw.toLowerCase();
	const value: string[] = [];

	for (const [stem, key] of Object.entries(CONDITION_STEMS)) {
		if (text.includes(stem) && !value.includes(key)) {
			value.push(key);
		}
	}

	return { value, custom: value.length ? "" : raw };
};

export const normCreatureType = (word: string): string | null => {
	const value = word.trim().toLowerCase();

	if (CREATURE_TYPES.has(value)) {
		return value;
	}

	if (value.endsWith("s") && CREATURE_TYPES.has(value.slice(0, -1))) {
		return value.slice(0, -1);
	}

	return null;
};

export const mapType = (monster: CreatureTypeInput): CreatureTypeMapping => {
	const rawType = monster.type ?? "";
	const text = rawType.trim().toLowerCase();
	const swarmMatch = /^swarm of (\w+)\s+(\w+)/.exec(text);

	if (swarmMatch) {
		const swarmSize = SIZE_MAP[swarmMatch[1] ?? ""] ?? "tiny";
		const inner = normCreatureType(swarmMatch[2] ?? "");
		if (inner) {
			return { value: inner, subtype: monster.subtype, swarm: swarmSize, custom: "" };
		}
		return {
			value: "custom",
			subtype: monster.subtype,
			swarm: swarmSize,
			custom: titleCase(swarmMatch[2] ?? ""),
		};
	}

	const canonical = normCreatureType(text);

	if (canonical) {
		return { value: canonical, subtype: monster.subtype, swarm: "", custom: "" };
	}

	return { value: "custom", subtype: monster.subtype, swarm: "", custom: titleCase(rawType) };
};

const titleCase = (value: string): string => {
	return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
};
