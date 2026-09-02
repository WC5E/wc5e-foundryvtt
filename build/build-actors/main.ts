import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SPELL_REPORT, USED_MONSTER_FOLDERS, buildActor } from "./actor.js";
import { folderDoc } from "./ids.js";
import { setAliases, setMonsters } from "./missing-spells.js";
import { ALIAS, DROPPED } from "./spell-embed.js";
import type { ParsedMonster } from "./types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

export function slugify(name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
	return slug || "monster";
}

export function main(): void {
	const intermediateDir = path.join(REPO, "reference", "parsed");
	const monsters = readJson(path.join(intermediateDir, "monsters.json")) as ParsedMonster[];
	const mainNames = new Set(monsters.map((monster) => monster.name.toLowerCase()));

	const wipPath = path.join(intermediateDir, "monsters_wip.json");
	let wipAdded = 0;
	if (existsSync(wipPath)) {
		for (const monster of readJson(wipPath) as ParsedMonster[]) {
			if (mainNames.has(monster.name.toLowerCase())) continue;
			monster._wip = true;
			monsters.push(monster);
			mainNames.add(monster.name.toLowerCase());
			wipAdded += 1;
		}
	}

	const outputDir = path.join(REPO, "src", "generated", "monsters");
	mkdirSync(outputDir, { recursive: true });
	for (const fileName of readdirSync(outputDir)) {
		if (fileName.endsWith(".json")) unlinkSync(path.join(outputDir, fileName));
	}

	const seen: Record<string, number> = {};
	let count = 0;
	for (const monster of monsters) {
		const actor = buildActor(monster);
		let slug = slugify(monster.name);
		if (Object.prototype.hasOwnProperty.call(seen, slug)) {
			seen[slug] += 1;
			slug = `${slug}-${seen[slug]}`;
		} else {
			seen[slug] = 0;
		}
		writeJson(path.join(outputDir, `${slug}.json`), actor);
		count += 1;
	}

	for (const [folderName, folderColor] of Object.entries(USED_MONSTER_FOLDERS)) {
		writeJson(path.join(outputDir, `_folder-${slugify(folderName)}.json`), folderDoc("Actor", folderName, folderColor));
	}

	console.log(`Wrote ${count} actor files to ${outputDir} (${count - wipAdded} main + ${wipAdded} WIP) in ${Object.keys(USED_MONSTER_FOLDERS).length} folders`);

	const totalMatched = SPELL_REPORT.reduce((total, [, , matched]) => total + matched, 0);
	const allUnmatched = SPELL_REPORT.flatMap(([, , , unmatched]) => unmatched);
	const unmatchedCounts = countByKey(allUnmatched.map((spell) => spell.key));
	console.log(`\nSpellcasting: ${SPELL_REPORT.length} casters | ${totalMatched} spells embedded | ${allUnmatched.length} references unresolved (${unmatchedCounts.length} distinct)`);
	if (unmatchedCounts.length) {
		const top = unmatchedCounts.slice(0, 20).map(([name, spellCount]) => `${name}(x${spellCount})`).join(", ");
		console.log(`  unresolved (stay as text): ${top}`);
	}

	if (DROPPED.length) {
		console.log(`  ${DROPPED.length} mis-split statblock fragment(s) dropped (a pact-magic header HEADER cannot parse; the spells inside them are not embedded and not in the manifest):`);
		for (const fragment of [...new Set(DROPPED)].sort(compareKeys)) {
			console.log(`      ${fragment}`);
		}
	}

	const records: Record<string, unknown> = {};
	for (const [actorId, name, , unmatched] of SPELL_REPORT) {
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