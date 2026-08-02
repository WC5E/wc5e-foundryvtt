# The auto-assign tool

The module's only runtime JavaScript, added in v1.17.0. Non-SRD spells can't be bundled, so
**153 monster spell references** and **221 class-spell-list entries** ship blank. This is a
GM-facing tool that searches compendiums the GM ticks, assigns what it finds from their own
content, and reports what it can't. Only *names* are in this repo; the spell documents come from
the user.

Design spec: `docs/superpowers/specs/2026-08-01-auto-assign-spells-design.md`.
Implementation plan and the manual test checklist:
`docs/superpowers/plans/2026-08-01-auto-assign-spells.md`.

## The shape of it

```
build/missing_spells.py        writes assets/missing-spells.json   (the contract)
        ↑ set_monsters()               ↑ set_spell_lists()
  build_actors.py            build_spell_lists.py + build_subclass_spells.py

scripts/wc5e.mjs               settings, menu, first-run prompt
scripts/auto-assign/
  manifest.mjs                 load the manifest; normaliseName()
  tree.mjs                     the compendium picker's tree (pure)
  index.mjs                    normalised-name -> match, over ticked packs only
  plan.mjs                     decide every write (pure)
  apply.mjs                    gather current state; execute a plan
  app.mjs                      the ApplicationV2 dialog
templates/auto-assign/*.hbs    configure / preview / report + two partials
styles/auto-assign.css
```

`plan.mjs` and `tree.mjs` are pure and never touch `game`; that is what makes the guarantees
testable without Foundry. `index.mjs` and `apply.mjs` reach Foundry only through injected
accessors defaulted at call time, so they stay importable under plain Node.

## The manifest is the contract

`assets/missing-spells.json` is generated. Never hand-edit it.

**Three builders contribute to it at different points in one build** — `build_actors.py` for
monsters, `build_spell_lists.py` and `build_subclass_spells.py` for the two list journals — so each
replaces only its own section. That is the same hazard the two list builders already guard against
for `flags.dnd5e.spellLists`: whichever ran second would otherwise silently wipe the first one's
entries. `verify` fails if either section is empty, because an absent section means a builder
stopped contributing and the tool would quietly do nothing there.

Records carry `name` (what a human reads), `key` (the lookup key), and the casting context
(`prep`, `level`, `perDay` for monsters; `source` for lists). Nothing else may go in — see the
licensing constraint in `CLAUDE.md`.

## normaliseName() is a port of `spell_embed._norm()`

If the two drift, **every lookup misses and the tool silently finds nothing**. No error, no clue.

- `verify` asserts `key == _norm(name)` for every record, from the Python side.
- `tests/normalise.test.mjs` runs the JS normaliser over every record in the real manifest and
  asserts it reproduces the key Python wrote, from the JS side.

Both sides explicitly strip zero-width characters (U+FEFF, U+200B, U+200C, U+200D) and normalise
U+0085 and U+001C–U+001F to a space, rather than relying on `\s` — Python's `re` and JavaScript's
regex disagree about all of those. Neither divergence was reachable from real data; differential
testing found them before they could fire. Keep the two functions in step and keep both tests
passing.

## Guarantees worth not breaking

**Additive and idempotent.** Nothing is removed or overwritten, and a second run plans zero
writes. Tested by folding a plan's writes back into the state and re-planning.

**"Not found" means "you are still missing this",** not "this wasn't in the packs you ticked this
run". `buildPlan` checks *already-satisfied* before it consults the index, and skips out-of-scope
targets entirely. Getting this backwards produced 144 false "missing" rows for a GM who re-scanned
with only a newly imported compendium selected — the spells were already on their monsters.

**Spell lists are matched by name, not uuid.** `collectState` resolves each page's existing links
back to names via pack indexes (one `getIndex` per pack, not one `fromUuid` per entry — a class
list can hold 150+). Matching by uuid alone means re-importing a spell into a different compendium
adds a second link to the same spell.

**Spell lists exist only in the compendium.** There is no world-side copy, so the *Class spell
lists* target is unavailable for the world-only destination. Enforced in `listsAvailable()` **and**
disabled in the UI.

**Packs are unlocked up front, before any write,** and re-locked in a `finally`. If one refuses to
unlock the run aborts rather than producing dozens of identical per-write failures; if a *re-lock*
fails that is reported, not swallowed, because a module pack left unlocked invites edits a module
update then wipes.

## dnd5e schema: `method`/`prepared`, not `preparation`

dnd5e 5.1 replaced `system.preparation` with `system.method` + `system.prepared`. A shim still
migrates the old shape **only when the new fields are absent** — and `toObject()` on a 5.x spell
always emits them, because both are declared `required` with an `initial`, so `SchemaField`
cleaning fills them in.

So `spellItemData()` must write the new fields directly. Writing `preparation` was silently
discarded and every assigned spell arrived as `method: ""` — at-will and innate spells missing
from their sheet sections, prepared ones showing unprepared, with no error. Mapping mirrors
`SpellData.#migratePreparation`.

The **build side is still on the old shape** and works only because it constructs JSON from
scratch without `method`/`prepared`, so the shim fires. That shim is documented as going away in
dnd5e 6.0. `build_spells.py`, `spell_embed.py`, `build_subclass_spells.py`,
`build_spell_progression.py` and `build_backgrounds.py` will all need the same treatment.

## Never commit packs written by a running Foundry

If the repo is symlinked into `Data/modules/` for testing, Foundry writes to the compiled packs in
place, and the tool — pointed at the compendium destination — copies the tester's own spell
documents into `packs/monsters`. `release.mjs` ships from `git archive HEAD`, so committing that
distributes non-SRD content. This happened during development via `git add -A` mid-session; the
branch was unpushed, so `packs/` was stripped from every commit and rebuilt.

`npm run verify` now fails if any pack is not a fresh compile. The tell is LevelDB file numbering:
`pack.mjs` `rm -rf`s the destination, so a real compile of every pack here yields exactly
`000005.ldb` + `MANIFEST-000002`. Close Foundry, `npm run pack`, then commit — and stage explicit
paths rather than `-A`.

## A module update replaces `packs/`

Compendium-side assignments are lost on upgrade and the tool must be re-run. The pack selection is
remembered so it is one click, and the first-run prompt re-fires once per module version to say
so. This is inherent to how Foundry ships compendiums, not a bug — but it is the behaviour most
likely to generate "it broke" reports, so it is stated in the dialog, the report, the README and
the release notes.

## Testing

`npm test` runs both suites — `python3 -m unittest` for the build side, `node --test` for the
runtime. Both stdlib, no test dependencies.

`app.mjs`, `wc5e.mjs` and the templates are Foundry-coupled and cannot be tested headlessly. Two
things substitute, and both have caught real bugs:

- compiling each `.hbs` against Foundry's own vendored Handlebars with a stub context, which is
  how a call to a `selected` helper that v14 does not register was found;
- reading the framework source at `/home/arthur/FoundryVTT/resources/app` for lifecycle ordering,
  which is how `_prepareContext` running *before* `_preFirstRender` was found — the dialog crashed
  before rendering.

The manual checklist is in the implementation plan.
