import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_VERSION = 1;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

export const MANIFEST_PATH = path.join(REPO, "module", "assets", "missing-spells.json");

export interface MissingSpellsManifest {
	version: number;
	aliases: Record<string, string>;
	monsters: Record<string, unknown>;
	spellLists: Record<string, unknown>;
}

const skeleton = (): MissingSpellsManifest => {
	return { version: MANIFEST_VERSION, aliases: {}, monsters: {}, spellLists: {} };
};

export const loadManifest = (manifestPath = MANIFEST_PATH): MissingSpellsManifest => {
	if (!existsSync(manifestPath)) {
		return skeleton();
	}

	const data = JSON.parse(readFileSync(manifestPath, "utf8"));

	if (data.version !== MANIFEST_VERSION) {
		return skeleton();
	}

	const base = skeleton();

	return {
		...data,
		aliases: data.aliases ?? base.aliases,
		monsters: data.monsters ?? base.monsters,
		spellLists: data.spellLists ?? base.spellLists,
	};
};

export const saveManifest = (data: MissingSpellsManifest, manifestPath = MANIFEST_PATH): void => {
	mkdirSync(path.dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, `${JSON.stringify(sortKeys(data), null, 2).replace(/\n/g, EOL)}${EOL}`, "utf8");
};

const updateManifest = (manifestPath: string, update: (_data: MissingSpellsManifest) => void): void => {
	const data = loadManifest(manifestPath);
	update(data);
	saveManifest(data, manifestPath);
};

export const setAliases = (aliases: Readonly<Record<string, string>>, manifestPath = MANIFEST_PATH): void => {
	updateManifest(manifestPath, (data) => {
		data.aliases = { ...aliases };
	});
};

export const setMonsters = (records: Record<string, unknown>, manifestPath = MANIFEST_PATH): void => {
	updateManifest(manifestPath, (data) => {
		data.monsters = { ...records };
	});
};

export const setSpellLists = (
	journalId: string,
	records: Record<string, unknown>,
	manifestPath = MANIFEST_PATH,
): void => {
	updateManifest(manifestPath, (data) => {
		const prefix = `${journalId}.`;
		const kept = Object.fromEntries(Object.entries(data.spellLists).filter(([key]) => !key.startsWith(prefix)));
		data.spellLists = { ...kept, ...records };
	});
};

const sortKeys = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (!isPlainObject(value)) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => compareKeys(left, right))
			.map(([key, entry]) => [key, sortKeys(entry)]),
	);
};

const compareKeys = (left: string, right: string): number => {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
};
