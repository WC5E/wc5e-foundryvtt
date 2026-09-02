import { makeId } from "../ids.js";
import { ABILITY_NAME, DAMAGE_TYPES } from "../mappings.js";

export const ATTACK_RE = /(?<melee>Melee|Ranged)(?:\s+or\s+(?<other>Melee|Ranged))?\s+(?<cls>Weapon|Spell)\s+Attack\s*:/i;
export const TOHIT_RE = /([+-]?\d+)\s+to hit/i;
export const REACH_RE = /reach\s+(\d+)\s*ft/i;
export const RANGE_RE = /range\s+(\d+)(?:\/(\d+))?\s*ft/i;
export const SAVE_RE = /DC\s*(\d+)\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i;

const DMG_RE = /(\d+)\s*\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s*(\w+)\s+damage/gi;

export interface DamagePart {
	number: number;
	denomination: number;
	bonus: string;
	types: string[];
	custom: { enabled: false; formula: "" };
	scaling: { mode: ""; number: 1; formula: "" };
}

export interface ParsedAttackText {
	attackType: "melee" | "ranged";
	classification: "weapon" | "spell";
	bonus: string;
	range: { value: string; units: "ft"; special: ""; override: false } | null;
}

export interface ParsedSaveText {
	dc: string;
	ability: string;
	parts: DamagePart[];
	onSave: "half" | "none";
}

type ActivityKind = "attack" | "save" | "utility";

interface ActivityBase {
	_id: string;
	type: ActivityKind;
	activation: { type: string; value: number; condition: string; override: boolean };
	consumption: Record<string, unknown>;
	description: { chatFlavor: string };
	duration: Record<string, unknown>;
	effects: [];
	range: { value: string; units: string; special: string; override: boolean };
	target: {
		template: Record<string, unknown>;
		affects: { count: string; type: string; choice: boolean; special: string };
		prompt: boolean;
		override: boolean;
	};
	uses: Record<string, unknown>;
	sort: number;
}

interface AttackActivity extends ActivityBase {
	type: "attack";
	attack: {
		ability: string;
		bonus: string;
		critical: { threshold: null };
		flat: boolean;
		type: { value: ParsedAttackText["attackType"]; classification: ParsedAttackText["classification"] };
	};
	damage: { critical: { bonus: string }; includeBase: boolean; parts: DamagePart[] };
}

interface SaveActivity extends ActivityBase {
	type: "save";
	save: { ability: string[]; dc: { calculation: string; formula: string } };
	damage: { onSave: ParsedSaveText["onSave"]; parts: DamagePart[] };
}

interface UtilityActivity extends ActivityBase {
	type: "utility";
}

export type ActorActivity = AttackActivity | SaveActivity | UtilityActivity;

export const parseDamageParts = (text: string): DamagePart[] => {
	return [...text.matchAll(DMG_RE)].map((match) => {
		const [, , number, denomination, sign, bonus, damageType] = match;
		const bonusValue = bonus ? (sign === "-" ? `-${bonus}` : bonus) : "";
		const type = damageType?.toLowerCase() ?? "";
		return {
			number: Number(number),
			denomination: Number(denomination),
			bonus: bonusValue,
			types: DAMAGE_TYPES.includes(type as (typeof DAMAGE_TYPES)[number]) ? [type] : [],
			custom: { enabled: false, formula: "" },
			scaling: { mode: "", number: 1, formula: "" },
		};
	});
}

export const parseAttackText = (text: string): ParsedAttackText | null => {
	const match = ATTACK_RE.exec(text);
	if (!match?.groups) {
		return null;
	}
	const primary = match.groups.melee.toLowerCase();
	const other = (match.groups.other ?? "").toLowerCase();
	const classification = match.groups.cls.toLowerCase() === "spell" ? "spell" : "weapon";
	const toHit = TOHIT_RE.exec(text);
	const bonus = toHit?.[1] ?? "";
	const reach = REACH_RE.exec(text);
	const range = RANGE_RE.exec(text);

	let attackType: "melee" | "ranged" = primary === "melee" || other === "melee" ? "melee" : "ranged";
	if (primary === "ranged" && other !== "melee") {
		attackType = "ranged";
	} else if (primary === "melee") {
		attackType = "melee";
	}

	let rangeValue: ParsedAttackText["range"] = null;
	if (attackType === "melee" && reach) {
		rangeValue = { value: reach[1] ?? "", units: "ft", special: "", override: false };
	} else if (range) {
		rangeValue = { value: range[1] ?? "", units: "ft", special: "", override: false };
	}

	return { attackType, classification, bonus: bonus.replace(/^\+/, ""), range: rangeValue };
}

export const parseSaveText = (text: string): ParsedSaveText | null => {
	const match = SAVE_RE.exec(text);
	if (!match) {
		return null;
	}
	const parts = parseDamageParts(text);
	return {
		dc: match[1] ?? "",
		ability: ABILITY_NAME[(match[2] ?? "").toLowerCase()] ?? "",
		parts,
		onSave: parts.length ? "half" : "none",
	};
}

export const baseActivity = (
	actorId: string,
	itemId: string,
	kind: ActivityKind,
	activationType: string,
	activationValue = 1,
): ActivityBase => {
	const activityId = makeId(actorId, itemId, "act", kind);
	return {
		_id: activityId,
		type: kind,
		activation: { type: activationType, value: activationValue, condition: "", override: false },
		consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: true },
		description: { chatFlavor: "" },
		duration: { concentration: false, value: "", units: "inst", special: "", override: false },
		effects: [],
		range: { value: "", units: "", special: "", override: false },
		target: {
			template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
			affects: { count: "", type: "", choice: false, special: "" },
			prompt: true,
			override: false,
		},
		uses: { spent: 0, max: "", recovery: [] },
		sort: 0,
	};
}

export const buildAttackActivity = (
	actorId: string,
	itemId: string,
	activationType: string,
	text: string,
): ActorActivity | null => {
	const parsed = parseAttackText(text);
	if (!parsed) {
		return null;
	}

	const activity = baseActivity(actorId, itemId, "attack", activationType);
	if (parsed.range) {
		activity.range = parsed.range;
	}
	activity.target.affects = { count: "1", type: "creature", choice: false, special: "" };
	return {
		...activity,
		type: "attack",
		attack: {
			ability: "",
			bonus: parsed.bonus,
			critical: { threshold: null },
			flat: true,
			type: { value: parsed.attackType, classification: parsed.classification },
		},
		damage: { critical: { bonus: "" }, includeBase: false, parts: parseDamageParts(text) },
	};
}

export const buildSaveActivity = (
	actorId: string,
	itemId: string,
	activationType: string,
	text: string,
): ActorActivity | null => {
	const parsed = parseSaveText(text);
	if (!parsed) {
		return null;
	}

	const activity = baseActivity(actorId, itemId, "save", activationType);
	return {
		...activity,
		type: "save",
		save: { ability: [parsed.ability], dc: { calculation: "", formula: parsed.dc } },
		damage: { onSave: parsed.onSave, parts: parsed.parts },
	};
}