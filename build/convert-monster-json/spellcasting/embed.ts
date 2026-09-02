import { makeId } from "../ids.js";
import { loadIndexes, type SpellIndexEntry } from "./indexes.js";
import { parseSpellcasting, type ParsedSpellcasting } from "./parse.js";

export interface UnmatchedSpell {
	name: string;
	key: string;
	prep: string;
	level: number | null;
	perDay: number | null;
}

export interface SpellEmbeddingResult {
	matched: number;
	unmatched: UnmatchedSpell[];
	dropped: string[];
}

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
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
): SpellEmbeddingResult {
	const parsedTraits = (monster.traits as Array<{ name: string; text: string }>)
		.filter((entry) => entry.name.toLowerCase().includes("spellcasting"))
		.map((entry) => parseSpellcasting(entry.text))
		.filter((parsed): parsed is ParsedSpellcasting => parsed !== null);
	if (!parsedTraits.length) return { matched: 0, unmatched: [], dropped: [] };

	const [custom, srd] = loadIndexes();
	const dropped = parsedTraits.flatMap((parsed) => parsed.dropped);
	const slots: Record<string, { value: number; override: null }> = {};
	for (const parsed of parsedTraits) {
		actor.system.attributes.spellcasting = parsed.ability;
		for (const group of parsed.groups) {
			if (group.prep === "prepared" && group.level && group.slots) {
				slots[`spell${group.level}`] = { value: group.slots, override: null };
			}
		}

		if (parsed.dc !== null) {
			const derived = 8 + prof + abilityMod(monster.abilities[parsed.ability] ?? 10);
			const delta = parsed.dc - derived;
			actor.system.bonuses ??= {};
			actor.system.bonuses.spell = { dc: delta ? String(delta) : "" };
		}
	}
	if (Object.keys(slots).length) actor.system.spells = slots;

	let matched = 0;
	const unmatched: UnmatchedSpell[] = [];
	const seen = new Set<string>();
	let sort = 200000;
	for (const parsed of parsedTraits) {
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
	}
	return { matched, unmatched, dropped };
}