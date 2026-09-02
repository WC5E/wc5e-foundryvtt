import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { normaliseName } from "./parse.js";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(.:)/, "$1");
const REPO = path.resolve(HERE, "..", "..", "..");

export interface SpellIndexEntry {
	name: string;
	img?: string | null;
	system: Record<string, any>;
	src: "custom" | "srd";
}

let customIndex: Record<string, SpellIndexEntry> | null = null;
let srdIndex: Record<string, SpellIndexEntry> | null = null;

function readJson(filePath: string): any {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadIndexes(): [Record<string, SpellIndexEntry>, Record<string, SpellIndexEntry>] {
	if (customIndex && srdIndex) return [customIndex, srdIndex];

	customIndex = {};
	const spellsDir = path.join(REPO, "src", "generated", "spells");
	for (const fileName of readdirSync(spellsDir)) {
		if (!fileName.endsWith(".json") || fileName.startsWith("_folder-")) continue;
		const document = readJson(path.join(spellsDir, fileName));
		customIndex[normaliseName(document.name)] = {
			name: document.name,
			img: document.img,
			system: document.system,
			src: "custom",
		};
	}

	srdIndex = {};
	const raw = readJson(path.join(REPO, "reference", "srd-index", "srd_spells_2014.json"));
	for (const [key, value] of Object.entries(raw) as Array<[string, any]>) {
		srdIndex[normaliseName(key)] = {
			name: value.name,
			img: value.img,
			system: value.system,
			src: "srd",
		};
	}

	return [customIndex, srdIndex];
}