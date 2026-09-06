import { makeId } from "../ids.js";
import { mdToHtml } from "../mappings.js";
import { isSpellcastingFeature } from "../spellcasting/parse.js";
import { renderSpellcastingHtml } from "../spellcasting/render.js";
import type { ActorItem } from "../types.js";
import { ATTACK_RE, baseActivity, buildAttackActivity, buildSaveActivity, type ActorActivity } from "./activities.js";

export interface FeatInput {
	name?: string | null;
	text: string;
}

export type FeatureSection = "trait" | "action" | "bonus" | "reaction" | "legendary";

export interface ParsedRechargeName {
	name: string;
	formula?: string;
}

const RECHARGE_SUFFIX_RE = /\s+\{@recharge\s+(\d+)\}\s*$/i;

export const parseRechargeName = (name: string): ParsedRechargeName => {
	const match = RECHARGE_SUFFIX_RE.exec(name);
	if (!match || match.index === undefined) {
		return { name };
	}
	return { name: name.slice(0, match.index).trimEnd(), formula: match[1] };
};

const buildFeatureActivity = (
	actorId: string,
	itemId: string,
	activationType: string,
	activationValue: number,
	text: string,
): ActorActivity => {
	let activity: ActorActivity | null = null;
	if (ATTACK_RE.test(text)) {
		activity = buildAttackActivity(actorId, itemId, activationType, text);
	}
	if (activity === null) {
		activity = buildSaveActivity(actorId, itemId, activationType, text);
	}
	if (activity === null) {
		activity = { ...baseActivity(actorId, itemId, "utility", activationType, activationValue), type: "utility" };
	}
	if (activationValue !== 1) {
		activity.activation.value = activationValue;
	}
	return activity;
};

export const buildFeatItem = (actorId: string, feat: FeatInput, section: FeatureSection, sort: number): ActorItem => {
	const parsedName = parseRechargeName(feat.name || "Feature");
	const name = parsedName.name;
	const text = feat.text;
	const itemId = makeId(actorId, section, name, sort);
	const activities: Record<string, ActorActivity> = {};
	let properties: string[] = [];
	
	// This will need better handling down the line, for now it is just
	// trying to catch and resolve {@recharge X} in the feature name.
	const uses = parsedName.formula
		? {
			spent: 0,
			max: "1",
			recovery: [{ period: "recharge", formula: parsedName.formula, type: "recoverAll" }],
		}
		: { spent: 0, max: "", recovery: [] };
	
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
		if (costMatch) {
			activationValue = Number(costMatch[1]);
		}

		const activity = buildFeatureActivity(actorId, itemId, activationType, activationValue, text);
		activities[activity._id] = activity;
	}

	const description = section === "trait" && isSpellcastingFeature(name)
		? renderSpellcastingHtml(text)
		: mdToHtml(text);

	const system = {
		description: { value: description, chat: "" },
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
		uses,
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
};
