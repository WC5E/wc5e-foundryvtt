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

export interface MonsterMacro {
	kind: "attack" | "hit" | "damage" | "dc" | "plain";
	data: Record<string, unknown>;
}

export interface RenderedMonsterText {
	text: string;
	macros: MonsterMacro[];
}

const renderMonsterEntry = (entry: MonsterSourceEntryContent): string => {
	if (typeof entry === "string") {
		return renderMonsterText(entry);
	}
	const heading = entry.name ? `${entry.name}. ` : "";
	return `${heading}${renderMonsterEntries(entry.entries ?? [])}`;
};

export const renderMonsterText = (value: string): string => {
	return renderMonsterTextStructured(value).text;
};

export const renderMonsterTextStructured = (value: string): RenderedMonsterText => {
	const rendered = renderSegment(value, 0);

	// TODO: there are workarounds here that should be corrected upstream in source
	return {
		text: rendered.text
			.replace(/\{@h}/gi, "<em>Hit:</em>")
			.replace(/\bspellcating\b/gi, "spellcasting")
			.replace(/\bspell casting\b/gi, "spellcasting")
			.replace(/\bspellcasting modifier\b/gi, "spellcasting ability"),
		macros: rendered.macros,
	};
};

const renderSegment = (text: string, start: number): RenderedMonsterText => {
	let output = "";
	const macros: MonsterMacro[] = [];
	let position = start;
	while (position < text.length) {
		const macroStart = text.indexOf("{@", position);
		if (macroStart < 0) {
			output += text.slice(position);
			break;
		}
		output += text.slice(position, macroStart);
		const macroEnd = findMacroEnd(text, macroStart + 2);
		if (macroEnd < 0) {
			output += text.slice(macroStart);
			break;
		}
		const body = text.slice(macroStart + 2, macroEnd);
		const separator = body.search(/\s/);
		if (separator < 0) {
			if (body.toLowerCase() === "h") {
				output += "<em>Hit:</em>";
				macros.push({ kind: "hit", data: { boundary: true } });
			} else {
				output += text.slice(macroStart, macroEnd + 1);
			}
			position = macroEnd + 1;
			continue;
		}
		const tag = body.slice(0, separator);
		const rawArguments = body.slice(separator).trim();
		const argumentsList = splitMacroArguments(rawArguments);
		const nested = renderSegment(rawArguments, 0);
		const rendered = renderTag(tag, argumentsList, nested.text);
		const suffix = tag.toLowerCase() === "damage" ? text.slice(macroEnd + 1).match(DAMAGE_SUFFIX_RE) : null;
		if (suffix) {
			const damageMacro = rendered.macros.find((macro) => macro.kind === "damage");
			if (damageMacro) {
				damageMacro.data.type = suffix[2].toLowerCase();
				rendered.text = `[[/damage ${argumentsList[0]?.trim() ?? ""} ${suffix[2].toLowerCase()}]]${suffix[1].includes(")") ? ")" : ""}`;
			}
		}
		output += rendered.text;
		macros.push(...nested.macros, ...rendered.macros);
		position = macroEnd + 1;
		if (suffix) {
			position += suffix[0].length;
		}
	}
	return { text: output, macros };
};

const DAMAGE_SUFFIX_RE = /^(\s*\)?\s*)(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage\b/i;

const findMacroEnd = (text: string, start: number): number => {
	let depth = 1;
	for (let index = start; index < text.length; index += 1) {
		if (text.startsWith("{@", index)) {
			depth += 1;
			index += 1;
		} else if (text[index] === "}") {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
};

const splitMacroArguments = (body: string): string[] => {
	const argumentsList: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < body.length; index += 1) {
		if (body.startsWith("{@", index)) {
			depth += 1;
			index += 1;
		} else if (body[index] === "}" && depth > 0) {
			depth -= 1;
		} else if (body[index] === "|" && depth === 0) {
			argumentsList.push(body.slice(start, index));
			start = index + 1;
		}
	}
	argumentsList.push(body.slice(start));
	return argumentsList;
};

interface RenderedTag {
	text: string;
	macros: MonsterMacro[];
}

const renderTag = (tag: string, argumentsList: string[], nestedBody: string): RenderedTag => {
	const value = argumentsList[0]?.trim() ?? "";
	switch (tag.toLowerCase()) {
		case "atk":
			return {
				text: `<em>${renderAttackKind(value)}</em>`,
				macros: [{ kind: "attack", data: attackData(value) }],
			};
		case "hit":
			return {
				text: value.startsWith("+") || value.startsWith("-") ? value : `+${value}`,
				macros: [{ kind: "hit", data: { bonus: value } }],
			};
		case "h":
			return { text: "<em>Hit:</em>", macros: [{ kind: "hit", data: { boundary: true } }] };
		case "dc":
			return { text: `DC ${value}`, macros: [{ kind: "dc", data: { dc: value } }] };
		case "damage":
			return {
				text: `[[/damage ${value}]]`,
				macros: [{ kind: "damage", data: { formula: value, type: "" } }],
			};
		case "status":
			return { text: `&Reference[condition=${value}]`, macros: [] };
		case "i":
			return { text: `*${nestedBody}*`, macros: [] };
		case "b":
			return { text: `**${nestedBody}**`, macros: [] };
		default:
			return { text: nestedBody, macros: [{ kind: "plain", data: { tag, value } }] };
	}
};

const attackData = (value: string): Record<string, unknown> => {
	const [primary, secondary] = value.toLowerCase().split(",");
	return {
		attackType: primary === "mw" || secondary === "mw" ? "melee" : "ranged",
		classification: primary === "ms" || secondary === "ms" ? "spell" : "weapon",
		code: value.toLowerCase(),
	};
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
