/**
 * pack.mjs -- Compile src/generated/monsters/*.json into the LevelDB compendium pack at
 * packs/monsters using the official Foundry CLI. Run: `npm run pack`.
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import path from "node:path";
import fs from "node:fs";
import { MODULE_DIR, REPO_ROOT, readModuleManifest } from "./paths.mjs";

const repo = REPO_ROOT;
const moduleDir = MODULE_DIR;

// Pack list comes from module.json so the manifest and the build can't drift:
// a pack declared there but missing from src/ is reported, not silently skipped.
const manifest = readModuleManifest();

// src/ splits generated (builder-owned) from authored (hand-maintained) content.
function srcDir(name) {
	for (const kind of ["generated", "authored"]) {
		const p = path.join(repo, "src", kind, name);
		if (fs.existsSync(p)) {
			return p;
		}
	}
	return path.join(repo, "src", "generated", name);
}

for (const entry of manifest.packs) {
	const name = entry.name;
	const src = srcDir(name);
	if (!fs.existsSync(src)) {
		console.log(`WARNING ${name} declared in module.json but missing from src/`);
		continue;
	}
	const dest = path.join(moduleDir, entry.path);
	// Clean destination so removed documents don't linger in the pack.
	fs.rmSync(dest, { recursive: true, force: true });
	fs.mkdirSync(dest, { recursive: true });
	console.log(`Compiling ${src} -> ${dest}`);
	await compilePack(src, dest, { log: true, recursive: false });
}
console.log("Done.");
