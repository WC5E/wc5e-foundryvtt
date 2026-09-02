import { ABILITY_NAME, DAMAGE_TYPES } from "./mappings.js";

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

export function parseDamageParts(text: string): DamagePart[] {
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

export function parseAttackText(text: string): ParsedAttackText | null {
	const match = ATTACK_RE.exec(text);
	if (!match?.groups) return null;
	const primary = match.groups.melee.toLowerCase();
	const other = (match.groups.other ?? "").toLowerCase();
	const classification = match.groups.cls.toLowerCase() === "spell" ? "spell" : "weapon";
	const toHit = TOHIT_RE.exec(text);
	const bonus = toHit?.[1] ?? "";
	const reach = REACH_RE.exec(text);
	const range = RANGE_RE.exec(text);

	let attackType: "melee" | "ranged" = primary === "melee" || other === "melee" ? "melee" : "ranged";
	if (primary === "ranged" && other !== "melee") attackType = "ranged";
	else if (primary === "melee") attackType = "melee";

	let rangeValue: ParsedAttackText["range"] = null;
	if (attackType === "melee" && reach) {
		rangeValue = { value: reach[1] ?? "", units: "ft", special: "", override: false };
	} else if (range) {
		rangeValue = { value: range[1] ?? "", units: "ft", special: "", override: false };
	}

	return { attackType, classification, bonus: bonus.replace(/^\+/, ""), range: rangeValue };
}

export function parseSaveText(text: string): ParsedSaveText | null {
	const match = SAVE_RE.exec(text);
	if (!match) return null;
	const parts = parseDamageParts(text);
	return {
		dc: match[1] ?? "",
		ability: ABILITY_NAME[(match[2] ?? "").toLowerCase()] ?? "",
		parts,
		onSave: parts.length ? "half" : "none",
	};
}