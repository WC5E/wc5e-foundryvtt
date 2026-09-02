/**
 * check_packs.mjs -- Do the compiled packs actually match src/?
 *
 * `npm run verify` reads src/. It confirms the packs *exist* and have the shape
 * of a fresh compile, but not that their contents agree. So editing a document
 * and forgetting `npm run pack` passes every check, merges, gets tagged, and
 * ships stale content -- release.mjs archives packs/ from the commit and has no
 * build step, so what is committed is what players get.
 *
 * This compares document *content*, not bytes. A byte comparison of the LevelDB
 * files would depend on the compiler behaving identically everywhere, which is a
 * bad thing for CI to assume; comparing the documents back out is true regardless.
 *
 *     node build/check_packs.mjs
 *
 * Exits non-zero and names the packs that are out of date.
 */
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleDir = path.join(repo, "module");
const manifest = JSON.parse(fs.readFileSync(path.join(moduleDir, "module.json"), "utf8"));

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

/**
 * Is everything authored in `src` present and identical in `built`?
 *
 * A subset, not an equality: compiling fills in schema defaults that the source
 * files never state -- a JournalEntry comes back with a `categories` array, for
 * one -- and failing on those would make this cry wolf on a perfectly current
 * pack. What matters is that nothing we wrote is missing or different.
 */
function contains(built, src, at = "") {
	if (src === null || typeof src !== "object") {
		return built === src ? null : at || "(root)";
	}
	if (Array.isArray(src)) {
		if (!Array.isArray(built) || built.length !== src.length) {
			return at || "(root)";
		}
		for (let i = 0; i < src.length; i++) {
			const bad = contains(built[i], src[i], `${at}[${i}]`);
			if (bad) {
				return bad;
			}
		}
		return null;
	}
	if (built === null || typeof built !== "object") {
		return at || "(root)";
	}
	for (const [k, v] of Object.entries(src)) {
		if (!(k in built)) {
			return at ? `${at}.${k}` : k;
		}
		const bad = contains(built[k], v, at ? `${at}.${k}` : k);
		if (bad) {
			return bad;
		}
	}
	return null;
}

const load = (dir) => {
	const out = new Map();
	if (!fs.existsSync(dir)) {
		return out;
	}
	for (const fn of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
		const doc = JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8"));
		if (doc?._id) {
			out.set(doc._id, doc);
		}
	}
	return out;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wc5e-packs-"));
const stale = [];

for (const entry of manifest.packs) {
	const src = load(srcDir(entry.name));
	const dest = path.join(tmp, entry.name);
	fs.mkdirSync(dest, { recursive: true });

	// Extract from a COPY. extractPack opens the database read-write and rotates
	// its MANIFEST, which is precisely the "a running Foundry wrote to this"
	// signature `npm run verify` rejects -- so reading the real packs here would
	// leave them dirty and fail the next check. Found the hard way.
	const copy = path.join(tmp, `${entry.name}.db`);
	fs.cpSync(path.join(moduleDir, entry.path), copy, { recursive: true });
	await extractPack(copy, dest, { log: false });
	const built = load(dest);

	const missing = [...src.keys()].filter((id) => !built.has(id));
	const extra = [...built.keys()].filter((id) => !src.has(id));
	const differing = [];
	for (const [id, doc] of src) {
		if (!built.has(id)) {
			continue;
		}
		const where = contains(built.get(id), doc);
		if (where) {
			differing.push(`${doc.name ?? id} (${where})`);
		}
	}

	if (missing.length || extra.length || differing.length) {
		stale.push(entry.name);
		console.error(
			`  ${entry.name}: ${missing.length} missing, ${extra.length} unexpected, ` +
				`${differing.length} changed  (src ${src.size} / packed ${built.size})`,
		);
		for (const d of differing.slice(0, 3)) {
			console.error(`      changed: ${d}`);
		}
	} else {
		console.log(`  ${entry.name}: ${src.size} documents match`);
	}
}

fs.rmSync(tmp, { recursive: true, force: true });

if (stale.length) {
	console.error(`\n  packs are out of date: ${stale.join(", ")}`);
	console.error("  run `npm run pack` and commit the result -- the release ships packs/ as committed\n");
	process.exit(1);
}
console.log("\n  all packs match src/\n");
