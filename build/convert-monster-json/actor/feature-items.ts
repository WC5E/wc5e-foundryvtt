import { makeId } from "../ids.js";
import { mdToHtml } from "../mappings.js";
import type { ActorItem } from "../types.js";
import { ATTACK_RE, baseActivity, buildAttackActivity, buildSaveActivity, type ActorActivity } from "./activities.js";

export interface FeatInput {
	name?: string | null;
	text: string;
}

export type FeatureSection = "trait" | "action" | "bonus" | "reaction" | "legendary";

function buildFeatureActivity(
	actorId: string,
	itemId: string,
	activationType: string,
	activationValue: number,
	text: string,
): ActorActivity {
	let activity: ActorActivity | null = null;
	if (ATTACK_RE.test(text)) activity = buildAttackActivity(actorId, itemId, activationType, text);
	if (activity === null) activity = buildSaveActivity(actorId, itemId, activationType, text);
	if (activity === null) {
		activity = { ...baseActivity(actorId, itemId, "utility", activationType, activationValue), type: "utility" };
	}
	if (activationValue !== 1) activity.activation.value = activationValue;
	return activity;
}

export function buildFeatItem(actorId: string, feat: FeatInput, section: FeatureSection, sort: number): ActorItem {
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

		const activity = buildFeatureActivity(actorId, itemId, activationType, activationValue, text);
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