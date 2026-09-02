import { setAliases, setMonsters } from "../missing-spells.js";
import { ALIAS } from "../spellcasting/aliases.js";
import type { ConversionResult } from "./convert.js";

export const reportConversion = (outputDir: string, result: ConversionResult): void => {
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

export const updateMonsterManifest = (result: ConversionResult): void => {
	const records: Record<string, unknown> = {};

	for (const [actorId, name, , unmatched] of result.spellReport) {
		if (!unmatched.length) {
			continue;
		}
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

const countByKey = (keys: string[]): Array<[string, number]> => {
	const counts = new Map<string, number>();

	for (const key of keys) {
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

const compareKeys = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
}