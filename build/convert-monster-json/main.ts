import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildActor, type SpellReportEntry } from "./actor.js";
import { folderDoc } from "./ids.js";
import { setAliases, setMonsters } from "./missing-spells.js";
import { ALIAS } from "./spell-embed.js";
import { loadMonstersFromFull } from "./source.js";
import type { ParsedMonster } from "./types.js";

const ROOT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

export function slugify(name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
	return slug || "monster";
}

export function main(): void {
	const intermediateDir = path.join(ROOT_PATH, "reference", "parsed");
	const monsters = loadMonstersFromFull(readJson(path.join(intermediateDir, "wc5e-mom-full.json")));

	const outputDir = path.join(ROOT_PATH, "src", "generated", "monsters");
	prepareOutputDirectory(outputDir);
	const result = convertMonsters(monsters);
	writeActors(outputDir, result.actors);
	writeFolders(outputDir, result.folders);
	reportConversion(outputDir, result);
	updateManifest(result);
}

function prepareOutputDirectory(outputDir: string): void {
	mkdirSync(outputDir, { recursive: true });
	for (const fileName of readdirSync(outputDir)) {
		if (fileName.endsWith(".json")) unlinkSync(path.join(outputDir, fileName));
	}
}

export function convertMonsters(monsters: ParsedMonster[]): ConversionResult {
	const seen: Record<string, number> = {};
	const folders: Record<string, string> = {};
	const spellReport: SpellReportEntry[] = [];
	const droppedSpellFragments: string[] = [];
	const actors: GeneratedActor[] = [];

	for (const monster of monsters) {
		const result = buildActor(monster);
		const slug = uniqueSlug(monster.name, seen);
		folders[result.folder.name] = result.folder.color;
		if (result.spellReport) spellReport.push(result.spellReport);
		droppedSpellFragments.push(...result.droppedSpellFragments);
		actors.push({ slug, actor: result.actor });
	}

	return { actors, folders, spellReport, droppedSpellFragments };
}

function uniqueSlug(name: string, seen: Record<string, number>): string {
	let slug = slugify(name);
	if (Object.prototype.hasOwnProperty.call(seen, slug)) {
		seen[slug] += 1;
		slug = `${slug}-${seen[slug]}`;
	} else {
		seen[slug] = 0;
	}
	return slug;
}

function writeActors(outputDir: string, actors: GeneratedActor[]): void {
	for (const { slug, actor } of actors) {
		writeJson(path.join(outputDir, `${slug}.json`), actor);
	}
}

function writeFolders(outputDir: string, folders: Record<string, string>): void {
	for (const [folderName, folderColor] of Object.entries(folders)) {
		writeJson(path.join(outputDir, `_folder-${slugify(folderName)}.json`), folderDoc("Actor", folderName, folderColor));
	}
}

function reportConversion(outputDir: string, result: ConversionResult): void {
	console.log(`Wrote ${result.actors.length} actor files to ${outputDir} from wc5e-mom-full.json in ${Object.keys(result.folders).length} folders`);

	const totalMatched = result.spellReport.reduce((total, [, , matched]) => total + matched, 0);
	const allUnmatched = result.spellReport.flatMap(([, , , unmatched]) => unmatched);
	const unmatchedCounts = countByKey(allUnmatched.map((spell) => spell.key));
	console.log(`\nSpellcasting: ${result.spellReport.length} casters | ${totalMatched} spells embedded | ${allUnmatched.length} references unresolved (${unmatchedCounts.length} distinct)`);
	if (unmatchedCounts.length) {
		const top = unmatchedCounts.slice(0, 20).map(([name, spellCount]) => `${name}(x${spellCount})`).join(", ");
		console.log(`  unresolved (stay as text): ${top}`);
	}

	if (result.droppedSpellFragments.length) {
		console.log(`  ${result.droppedSpellFragments.length} mis-split statblock fragment(s) dropped (a pact-magic header HEADER cannot parse; the spells inside them are not embedded and not in the manifest):`);
		for (const fragment of [...new Set(result.droppedSpellFragments)].sort(compareKeys)) {
			console.log(`      ${fragment}`);
		}
	}
}

function updateManifest(result: ConversionResult): void {
	const records: Record<string, unknown> = {};
	for (const [actorId, name, , unmatched] of result.spellReport) {
		if (!unmatched.length) continue;
		records[actorId] = {
			name,
			pack: "monsters",
			spells: [...unmatched].sort((left, right) => compareKeys(left.key, right.key)),
		};
	}
	setAliases(ALIAS);
	setMonsters(records);
	const manifestSpellCount = Object.values(records).reduce((total, record: any) => total + record.spells.length, 0);
	console.log(`  auto-assign manifest: ${Object.keys(records).length} monsters, ${manifestSpellCount} spell references`);
}

function readJson(filePath: string): unknown {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
	writeFileSync(filePath, JSON.stringify(value, null, 2).replace(/\n/g, EOL), "utf8");
}

function countByKey(keys: string[]): Array<[string, number]> {
	const counts = new Map<string, number>();
	for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function compareKeys(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}