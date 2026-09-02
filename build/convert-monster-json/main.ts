import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { convertMonsters } from "./pipeline/convert.js";
import { prepareOutputDirectory, readJson, writeActors, writeFolders } from "./pipeline/output.js";
import { reportConversion, updateMonsterManifest } from "./pipeline/report.js";
import { loadMonstersFromFull } from "./source/load.js";

export { convertMonsters, slugify, type ConversionResult, type GeneratedActor } from "./pipeline/convert.js";

const ROOT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const main = (): void => {
	const intermediateDir = path.join(ROOT_PATH, "reference", "parsed");
	const monsters = loadMonstersFromFull(readJson(path.join(intermediateDir, "wc5e-mom-full.json")));

	const outputDir = path.join(ROOT_PATH, "src", "generated", "monsters");
	prepareOutputDirectory(outputDir);
	const result = convertMonsters(monsters);
	writeActors(outputDir, result.actors);
	writeFolders(outputDir, result.folders);
	reportConversion(outputDir, result);
	updateMonsterManifest(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
