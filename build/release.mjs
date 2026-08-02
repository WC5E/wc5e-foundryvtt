/**
 * release.mjs -- Build the release artifact for a GitHub Release.
 *
 * Produces dist/module.zip containing ONLY what Foundry needs at runtime
 * (module.json, packs/, assets/, plus the licence and readme), with those paths
 * at the root of the archive. Everything is taken from the current commit via
 * `git archive`, so a release can never contain uncommitted or stray local
 * files. Also copies module.json to dist/ to be uploaded as a second release
 * asset -- that is what makes the "releases/latest/download/module.json"
 * manifest URL resolvable.
 *
 * Run: `npm run release`, then upload both dist/ files to a tag named v<version>.
 * See CLAUDE.md "Cutting a release".
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(__dirname);
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

// Files that ship to players. Anything not listed stays out of the zip.
const RUNTIME = ["module.json", "packs", "assets", "scripts", "templates", "lang", "styles",
                 "LICENSE.md", "README.md"];

const manifest = JSON.parse(fs.readFileSync(path.join(repo, "module.json"), "utf8"));
const { version } = manifest;
const tag = `v${version}`;
const fail = (msg) => { console.error(`\n  release aborted: ${msg}\n`); process.exit(1); };

// 1. The archive comes from HEAD, so a dirty tree would silently ship stale content.
if ( git("status", "--porcelain") ) fail("working tree is dirty -- commit before releasing");

// 2. `download` must point at THIS version's asset. Pointing it at a branch (or
//    at a stale version) is what makes version numbers meaningless: every
//    installer would get whatever that branch happens to be at the time.
const expected = `/releases/download/${tag}/module.zip`;
if ( !manifest.download?.endsWith(expected) ) {
  fail(`module.json download must end with "${expected}"\n     got: ${manifest.download}`);
}
if ( !manifest.manifest?.includes("/releases/latest/download/module.json") ) {
  fail(`module.json manifest should be the releases/latest URL so Foundry can detect updates\n     got: ${manifest.manifest}`);
}

// 3. Don't ship a release with an empty or missing compendium.
for ( const pack of manifest.packs ) {
  const dir = path.join(repo, pack.path);
  if ( !fs.existsSync(dir) || !fs.readdirSync(dir).some(f => f.endsWith(".ldb")) ) {
    fail(`pack "${pack.name}" has no compiled data at ${pack.path} -- run "npm run pack"`);
  }
}

const dist = path.join(repo, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const zip = path.join(dist, "module.zip");
git("archive", "--format=zip", `--output=${zip}`, "HEAD", ...RUNTIME);
fs.copyFileSync(path.join(repo, "module.json"), path.join(dist, "module.json"));

const kb = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`Built dist/module.zip  (${kb} KB, from ${git("rev-parse", "--short", "HEAD")})`);
console.log(`Built dist/module.json (${version})\n`);
console.log(`Next:  gh release create ${tag} dist/module.zip dist/module.json \\`);
console.log(`         --title "${tag}" --notes "..."`);
