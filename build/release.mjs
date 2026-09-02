/**
 * release.mjs -- Build the release artifact for a GitHub Release.
 *
 * Produces dist/module.zip containing exactly the module/ directory (module.json,
 * packs/, assets/, lang/, scripts/, templates/, styles/) with those paths at the
 * root of the archive -- module/ is everything module.json references, so
 * archiving that one subtree is sufficient. Taken from the current commit via
 * `git archive`, so a release can never contain uncommitted or stray local files.
 * Also copies module.json to dist/ to be uploaded as a second release asset --
 * that is what makes the "releases/latest/download/module.json" manifest URL
 * resolvable.
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

const manifest = JSON.parse(fs.readFileSync(path.join(repo, "module", "module.json"), "utf8"));
const { version } = manifest;
// Normally the tag is the version. The dev channel is the exception: it reuses a
// single `dev` tag so testers keep one manifest URL that always serves the newest
// build, and the release workflow sets RELEASE_TAG=dev for it.
const tag = process.env.RELEASE_TAG || `v${version}`;
const isDev = tag === "dev";
const fail = (msg) => {
 console.error(`\n  release aborted: ${msg}\n`); process.exit(1); 
};

// 1. The archive comes from HEAD, so a dirty tree would silently ship stale content.
if ( git("status", "--porcelain") ) {
 fail("working tree is dirty -- commit before releasing"); 
}

// 2. `download` must point at THIS version's asset. Pointing it at a branch (or
//    at a stale version) is what makes version numbers meaningless: every
//    installer would get whatever that branch happens to be at the time.
const expected = `/releases/download/${tag}/module.zip`;
if ( !manifest.download?.endsWith(expected) ) {
  fail(`module.json download must end with "${expected}"\n     got: ${manifest.download}`);
}
// A stable release must advertise releases/latest so Foundry finds the newest one.
// A dev build must NOT: releases/latest skips pre-releases, so pointing there
// would quietly hand testers the last stable build instead of the one they are
// meant to be testing. It points at the fixed dev tag instead.
const expectedManifest = isDev
  ? "/releases/download/dev/module.json"
  : "/releases/latest/download/module.json";
if ( !manifest.manifest?.includes(expectedManifest) ) {
  fail(`module.json manifest must contain "${expectedManifest}"\n     got: ${manifest.manifest}`);
}

// 3. Don't ship a release with an empty or missing compendium.
for ( const pack of manifest.packs ) {
  const dir = path.join(repo, "module", pack.path);
  if ( !fs.existsSync(dir) || !fs.readdirSync(dir).some(f => f.endsWith(".ldb")) ) {
    fail(`pack "${pack.name}" has no compiled data at ${pack.path} -- run "npm run pack"`);
  }
}

const dist = path.join(repo, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const zip = path.join(dist, "module.zip");
// HEAD:module archives that subtree with its own root as the archive root, so
// module.json ends up at the zip root rather than under a module/ prefix.
git("archive", "--format=zip", `--output=${zip}`, "HEAD:module");
fs.copyFileSync(path.join(repo, "module", "module.json"), path.join(dist, "module.json"));

const kb = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`Built dist/module.zip  (${kb} KB, from ${git("rev-parse", "--short", "HEAD")})`);
console.log(`Built dist/module.json (${version})\n`);
console.log(`Next:  gh release create ${tag} dist/module.zip dist/module.json \\`);
console.log(`         --title "${tag}" --notes "..."`);
