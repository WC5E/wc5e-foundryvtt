import { makeId } from "./ids.js";
import { ABILITY_NAME, DAMAGE_TYPES, mdToHtml } from "./mappings.js";

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

export interface FeatInput {
	name?: string | null;
	text: string;
}

export type FeatureSection = "trait" | "action" | "bonus" | "reaction" | "legendary";

type ActorActivity = Record<string, any>;

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

export function baseActivity(
	actorId: string,
	itemId: string,
	kind: string,
	activationType: string,
	activationValue = 1,
): ActorActivity {
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

export function buildAttackActivity(
	actorId: string,
	itemId: string,
	activationType: string,
	text: string,
): ActorActivity | null {
	const parsed = parseAttackText(text);
	if (!parsed) return null;

	const activity = baseActivity(actorId, itemId, "attack", activationType);
	if (parsed.range) activity.range = parsed.range;
	activity.target.affects = { count: "1", type: "creature", choice: false, special: "" };
	activity.attack = {
		ability: "",
		bonus: parsed.bonus,
		critical: { threshold: null },
		flat: true,
		type: { value: parsed.attackType, classification: parsed.classification },
	};
	activity.damage = { critical: { bonus: "" }, includeBase: false, parts: parseDamageParts(text) };
	return activity;
}

export function buildSaveActivity(
	actorId: string,
	itemId: string,
	activationType: string,
	text: string,
): ActorActivity | null {
	const parsed = parseSaveText(text);
	if (!parsed) return null;

	const activity = baseActivity(actorId, itemId, "save", activationType);
	activity.save = { ability: [parsed.ability], dc: { calculation: "", formula: parsed.dc } };
	activity.damage = { onSave: parsed.onSave, parts: parsed.parts };
	return activity;
}

export function buildFeatItem(actorId: string, feat: FeatInput, section: FeatureSection, sort: number) {
	const name = feat.name || "Feature";
	const text = feat.text;
	const itemId = makeId(actorId, section, name, sort);
	const activities: Record<string, ActorActivity> = {};
	let properties: string[] = [];
	const activationTypeMap: Record<Exclude<FeatureSection, "trait">, string> = {
		action: "action",
		bonus: "bonus",
		reaction: "reaction",
		legendary: "legendary",
	};

	if (section === "trait") {
		properties = ["trait"];
	} else {
		const activationType = activationTypeMap[section];
		let activationValue = 1;
		const costMatch = /costs?\s+(\d+)\s+action/i.exec(`${name} ${text}`);
		if (costMatch) activationValue = Number(costMatch[1]);

		let activity: ActorActivity | null = null;
		if (ATTACK_RE.test(text)) activity = buildAttackActivity(actorId, itemId, activationType, text);
		if (activity === null) activity = buildSaveActivity(actorId, itemId, activationType, text);
		if (activity === null) activity = baseActivity(actorId, itemId, "utility", activationType, activationValue);
		if (activationValue !== 1) activity.activation.value = activationValue;
		activities[activity._id] = activity;
	}

	const system = {
		description: { value: mdToHtml(text), chat: "" },
		identifier: "",
		source: { custom: "", book: "", page: "", license: "", revision: 1, rules: "2014" },
		activation: { type: "", value: null, condition: "" },
		duration: { value: "", units: "" },
		cover: null,
		crewed: false,
		target: {
			template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
			affects: { count: "", type: "", choice: false, special: "" },
		},
		range: { value: null, long: null, units: "", special: "" },
		uses: { spent: 0, max: "", recovery: [] },
		type: { value: "monster", subtype: "" },
		requirements: "",
		properties,
		prerequisites: { level: null },
		activities,
	};

	return {
		_id: itemId,
		name,
		type: "feat",
		img: section === "trait" ? "icons/svg/item-bag.svg" : "icons/svg/sword.svg",
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