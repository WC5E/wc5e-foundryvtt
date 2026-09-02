import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import path from "node:path";

import { folderDoc } from "../ids.js";
import { slugify, type GeneratedActor } from "./convert.js";

export function prepareOutputDirectory(outputDir: string): void {
	mkdirSync(outputDir, { recursive: true });
	for (const fileName of readdirSync(outputDir)) {
		if (fileName.endsWith(".json")) unlinkSync(path.join(outputDir, fileName));
	}
}

export function writeActors(outputDir: string, actors: GeneratedActor[]): void {
	for (const { slug, actor } of actors) {
		writeJson(path.join(outputDir, `${slug}.json`), actor);
	}
}

export function writeFolders(outputDir: string, folders: Record<string, string>): void {
	for (const [folderName, folderColor] of Object.entries(folders)) {
		writeJson(path.join(outputDir, `_folder-${slugify(folderName)}.json`), folderDoc("Actor", folderName, folderColor));
	}
}

export function readJson(filePath: string): unknown {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
	writeFileSync(filePath, JSON.stringify(value, null, 2).replace(/\n/g, EOL), "utf8");
}