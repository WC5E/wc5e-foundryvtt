import type { MonsterSourceEntryContent, MonsterSourceRecord } from "../types.js";

export const renderSpellcasting = (record: NonNullable<MonsterSourceRecord["spellcasting"]>[number]): string => {
	const header = renderMonsterEntries(record.headerEntries ?? [])
		.replace(/\s+/g, " ")
		.trim();
	const sections = [header];
	for (const [level, group] of Object.entries(record.spells ?? {}).sort(
		([left], [right]) => Number(left) - Number(right),
	)) {
		const spells = renderSpellNames(group.spells);
		if (!spells) {
			continue;
		}
		sections.push(
			level === "0"
				? `Cantrips (at will): ${spells}`
				: `${ordinal(Number(level))} level (${group.slots ?? 0} slots): ${spells}`,
		);
	}
	const will = renderSpellNames(record.will);
	if (will) {
		sections.push(`At will: ${will}`);
	}
	for (const [uses, spells] of Object.entries(record.daily ?? {})) {
		const count = Number.parseInt(uses, 10);
		if (!Number.isFinite(count)) {
			throw new Error(`${record.name}: invalid daily spellcasting frequency ${uses}`);
		}
		const names = renderSpellNames(spells);
		if (names) {
			sections.push(`${count}/day${uses.endsWith("e") ? " each" : ""}: ${names}`);
		}
	}
	const footer = renderMonsterEntries(record.footerEntries ?? []);
	if (footer) {
		sections.push(footer);
	}
	return sections.filter(Boolean).join("\n");
};

const renderSpellNames = (spells: string[] | undefined): string => {
	return (spells ?? []).map(renderMonsterText).filter(Boolean).join(", ");
};

const ordinal = (level: number): string => {
	const suffix = level % 100 >= 11 && level % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[level % 10] ?? "th");
	return `${level}${suffix}`;
};

export const renderMonsterEntries = (entries: MonsterSourceEntryContent[]): string => {
	return entries
		.map((entry) => {
			if (typeof entry === "string") {
				return renderMonsterText(entry);
			}
			if (entry.type === "list") {
				return (entry.items ?? []).map((item) => `- ${renderMonsterEntry(item)}`).join("\n");
			}
			const heading = entry.name ? `${entry.name}. ` : "";
			return `${heading}${renderMonsterEntries(entry.entries ?? [])}`;
		})
		.filter(Boolean)
		.join("\n\n");
};

const renderMonsterEntry = (entry: MonsterSourceEntryContent): string => {
	if (typeof entry === "string") {
		return renderMonsterText(entry);
	}
	const heading = entry.name ? `${entry.name}. ` : "";
	return `${heading}${renderMonsterEntries(entry.entries ?? [])}`;
};

export const renderMonsterText = (value: string): string => {
	let output = value;
	let previous: string;
	do {
		previous = output;
		output = output.replace(/\{@([a-z]+) ([^{}]*)}/gi, (_match, tag: string, body: string) => renderTag(tag, body));
	} while (output !== previous);

	// TODO: there are workarounds here that should be corrected upstream in source
	return output
		.replace(/\{@h}/gi, "Hit:")
		.replace(/\bspellcating\b/gi, "spellcasting")
		.replace(/\bspell casting\b/gi, "spellcasting")
		.replace(/\bspellcasting modifier\b/gi, "spellcasting ability");
};

const renderTag = (tag: string, body: string): string => {
	const [content] = body.split("|");
	const value = content?.trim() ?? "";
	switch (tag.toLowerCase()) {
		case "atk":
			return renderAttackKind(value);
		case "hit":
			return value.startsWith("+") || value.startsWith("-") ? value : `+${value}`;
		case "h":
			return "Hit:";
		case "dc":
			return `DC ${value}`;
		case "i":
			return `*${value}*`;
		case "b":
			return `**${value}**`;
		default:
			return value;
	}
};

const renderAttackKind = (value: string): string => {
	const kinds: Record<string, string> = {
		mw: "Melee Weapon Attack:",
		rw: "Ranged Weapon Attack:",
		ms: "Melee Spell Attack:",
		rs: "Ranged Spell Attack:",
		"mw,rw": "Melee or Ranged Weapon Attack:",
		"ms,rs": "Melee or Ranged Spell Attack:",
	};
	return kinds[value.toLowerCase()] ?? value;
};
