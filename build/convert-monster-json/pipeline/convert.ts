import { buildActor, type SpellReportEntry } from "../actor/build.js";
import type { ParsedMonster } from "../types.js";

export interface GeneratedActor {
	slug: string;
	actor: Record<string, any>;
}

export interface ConversionResult {
	actors: GeneratedActor[];
	folders: Record<string, string>;
	spellReport: SpellReportEntry[];
	droppedSpellFragments: string[];
}

export const slugify =(name: string): string => {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
	return slug || "monster";
}

export const convertMonsters =(monsters: ParsedMonster[]): ConversionResult => {
	const seen: Record<string, number> = {};
	const folders: Record<string, string> = {};
	const spellReport: SpellReportEntry[] = [];
	const droppedSpellFragments: string[] = [];
	const actors: GeneratedActor[] = [];

	for (const monster of monsters) {
		const result = buildActor(monster);
		const slug = uniqueSlug(monster.name, seen);
		folders[result.folder.name] = result.folder.color;

		if (result.spellReport) {
			spellReport.push(result.spellReport);
		}

		droppedSpellFragments.push(...result.droppedSpellFragments);
		actors.push({ slug, actor: result.actor });
	}

	return { actors, folders, spellReport, droppedSpellFragments };
}

const uniqueSlug =(name: string, seen: Record<string, number>): string => {
	let slug = slugify(name);

	if (Object.prototype.hasOwnProperty.call(seen, slug)) {
		seen[slug] += 1;
		slug = `${slug}-${seen[slug]}`;
	} else {
		seen[slug] = 0;
	}
	return slug;
}