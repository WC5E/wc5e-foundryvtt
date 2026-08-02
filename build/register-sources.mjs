/**
 * register-sources.mjs -- Declare this module's source books in
 * `module.json` -> `flags.dnd5e.sourceBooks`, and flag source metadata that
 * would show up wrong in the compendium browser.
 *
 * dnd5e's compendium browser builds its source filter from each document's
 * derived `system.source.value` and matches on `system.source.slug`. Those come
 * from the `book` field ONLY:
 *
 *     this.value = this.book || (pkg?.title ?? "");
 *     this.slug  = formatIdentifier(this.value);
 *
 * `custom` never reaches them -- it only sets the display label. So every
 * document must set `book`, not just `custom`. Ours set only `custom` until
 * v1.18.1, which meant `value` fell through to the module's *title*: the filter
 * offered one entry that matched nothing, while the 17 SRD-derived documents
 * (which do set `book`) filtered correctly. There is a fallback for
 * single-book modules -- `getModuleBook()` returns the sole key of
 * `flags.dnd5e.sourceBooks` -- but it gives up when there is more than one, and
 * we ship four.
 *
 * The label comes from `CONFIG.DND5E.sourceBooks[value] ?? value`, and that map
 * is only populated from a manifest via `registerSourceBooks()`:
 *
 *     function registerSourceBooks(manifest) {
 *       if ( !manifest.flags.dnd5e?.sourceBooks ) return;
 *       Object.assign(CONFIG.DND5E.sourceBooks, manifest.flags.dnd5e.sourceBooks);
 *     }
 *
 * Undeclared sources therefore still appear, but labelled with their raw string.
 * That is how GoC45's Death Knight ended up filed in the browser under a
 * literal `https://drive.google.com/...` URL: its `source.custom` was empty, so
 * `source.value` fell through to the `book` field, which held a share link.
 *
 * Run via `npm run sources`. Generated rather than hand-written so the manifest
 * can't drift from what the documents actually claim.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(__dirname);

// dnd5e's own registered books, which our SRD-derived documents legitimately cite.
const SYSTEM_BOOKS = new Set(["SRD 5.1", "SRD 5.2", "Free Rules"]);
const JUNK = /^(https?:\/\/|www\.)/i;

const found = new Map();      // source value -> document count
const suspect = [];

for ( const pack of fs.readdirSync(path.join(repo, "src")) ) {
  const dir = path.join(repo, "src", pack);
  if ( !fs.statSync(dir).isDirectory() ) continue;
  for ( const file of fs.readdirSync(dir).filter(f => f.endsWith(".json")) ) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const src = doc.system?.source;
    if ( !src || typeof src !== "object" ) continue;          // folders
    // dnd5e derives `source.value` from `book` alone -- register what it will
    // actually look up, not what the sheet happens to display.
    const value = (src.book || src.custom || "").trim();
    if ( !value ) continue;
    found.set(value, (found.get(value) ?? 0) + 1);
    if ( JUNK.test(value) ) suspect.push(`${pack}/${doc.name}: ${value}`);
  }
}

const ours = [...found.keys()].filter(v => !SYSTEM_BOOKS.has(v) && !JUNK.test(v)).sort();
// Keep the label readable; dnd5e uses it verbatim when there's no translation.
const sourceBooks = Object.fromEntries(ours.map(v => [v, v.replace(" - ", " — ")]));

const manifestPath = path.join(repo, "module.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const flags = (manifest.flags ??= {});
const dnd5e = (flags.dnd5e ??= {});

if ( JSON.stringify(dnd5e.sourceBooks) !== JSON.stringify(sourceBooks) ) {
  dnd5e.sourceBooks = sourceBooks;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`  registered ${ours.length} source books in module.json`);
} else {
  console.log(`  module.json flags.dnd5e.sourceBooks already up to date (${ours.length})`);
}
for ( const [value, count] of [...found].sort((a, b) => b[1] - a[1]) ) {
  const tag = SYSTEM_BOOKS.has(value) ? "(dnd5e)" : JUNK.test(value) ? "<-- SUSPECT" : "";
  console.log(`    ${String(count).padStart(4)}  ${value} ${tag}`);
}
if ( suspect.length ) {
  console.error(`\n  ${suspect.length} document(s) cite a URL as their source, which the compendium`);
  console.error("  browser will show verbatim as the book name:");
  suspect.forEach(s => console.error(`    ${s}`));
  process.exitCode = 1;
}
