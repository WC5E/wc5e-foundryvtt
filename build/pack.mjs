/**
 * pack.mjs -- Compile src/monsters/*.json into the LevelDB compendium pack at
 * packs/monsters using the official Foundry CLI. Run: `npm run pack`.
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(__dirname);

// Pack list comes from module.json so the manifest and the build can't drift:
// a pack declared there but missing from src/ is reported, not silently skipped.
const manifest = JSON.parse(fs.readFileSync(path.join(repo, "module.json"), "utf8"));

for ( const entry of manifest.packs ) {
  const name = entry.name;
  const src = path.join(repo, "src", name);
  if ( !fs.existsSync(src) ) { console.log(`WARNING ${name} declared in module.json but missing from src/`); continue; }
  const dest = path.join(repo, entry.path);
  // Clean destination so removed documents don't linger in the pack.
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  console.log(`Compiling ${src} -> ${dest}`);
  await compilePack(src, dest, { log: true, recursive: false });
}
console.log("Done.");
