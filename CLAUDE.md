## What this is

`wc5e-foundryvtt` — a **Foundry VTT v13–v14 compendium module** for the **dnd5e 5.3.3** system,
generated from the community [Warcraft 5e Conversion](https://github.com/WC5E/Warcraft-5e-Conversion)
markdown. Everything module.json references — `module.json` itself, `assets/`, `lang/`, compiled
LevelDB packs, and the one runtime feature (the **auto-assign tool**, `scripts/`/`templates/`) —
lives together under `module/`. Everything else in the repo is build tooling or source material.

Current packs (12, 1235 documents): **monsters** (420 NPC actors), **spells** (101), **items** (21),
**journals** (guide), **spell-lists** (7 class spell lists), **backgrounds** (4 + their features),
and the player options merged from GoC45's `wc5e-ccc`: **classes** (12 + 36 subclasses),
**class-features** (443), **races** (28 + racials), **feats** (18), **new-equipment** (14),
**summons** (26 actors).

## Where the detail lives

`docs/internals/` carries the per-area detail; this file carries what you need before touching
anything. Read the relevant one before working in that area — each documents failures that are
silent in Foundry.

| Document                           | Read it before                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/internals/sources.md`        | trusting the repo or the PDFs, or running a parser (+ the sibling-clone prerequisite) |
| `docs/internals/build-pipeline.md` | changing a builder, or wondering why a conversion looks odd                           |
| `docs/internals/spell-content.md`  | touching spell lists, subclass spells, progression, advancement or backgrounds        |
| `docs/internals/auto-assign.md`    | changing `module/scripts/`, `module/templates/`, `module/styles/` or the missing-spells manifest |
| `docs/internals/releasing.md`      | cutting a release, or wondering what the migration from the old repo touched          |

Specs and implementation plans are in `docs/superpowers/`.

## Prerequisite: the upstream source repo

The markdown builders read the WC5E source from a **sibling clone** that is not part of this repo. Without
it, `npm run spells` / `npm run spell-lists` / `npm run backgrounds` fail:

```bash
git clone https://github.com/WC5E/Warcraft-5e-Conversion ../Warcraft-5e-Conversion
```

Because `src/` is committed, you can rebuild the packs (`npm run pack`) and edit the item/journal
builders **without** the clone. Which files each script reads:
`docs/internals/sources.md`.

## Commands

```bash
npm install                     # Foundry CLI (only dependency); node_modules/ is not present by default
npm run build                   # spells → actors → items → journal → spell-lists
                                #   → subclass-spells → backgrounds → spell-progression
                                #   → sources → pack
npm run pack                    # src/{generated,authored}/**/*.json → module/packs/** LevelDB (the only step Foundry cares about)
npm run verify                  # THE GATE: every invariant, origin-agnostic
npm test                        # python3 -m unittest + node --test, both stdlib
node build/_chk.mjs             # lighter check: extract each pack back out, print doc counts
```

Individual stages: `npm run spells`, `npm run actors`, `npm run items`,
`npm run journal`, `npm run spell-lists`, `npm run backgrounds`. There is no test suite and no
linter — `_chk.mjs` plus loading the module in Foundry is the verification loop.

**`spells` must run before `actors` and before `spell-lists`** — both read `src/generated/spells/*.json`:
`spell_embed.py` to embed spells onto casters, `build_spell_lists.py` to resolve spell names to
document ids. Running either first bakes in the _previous_ run's spell data, and since spell ids
derive from spell _names_, a renamed spell silently breaks both. The `build` script orders them
correctly; keep it that way if you add stages. `items` and `journal` have no dependencies.
Rebuilding is deterministic: identical inputs produce byte-identical output, so `git status` after
a rebuild is a real regression check.

**Never commit `module/packs/` written by a running Foundry.** If `module/` is symlinked into
`Data/modules/wc5e-foundryvtt` for testing, Foundry opens the compiled packs and writes to them in
place -- and the auto-assign tool, pointed at the compendium destination, copies the tester's own
spell documents into `module/packs/monsters`. `release.mjs` ships from `git archive HEAD:module`, so
committing that would distribute non-SRD content. It happened once, via a careless `git add -A`
mid-testing; the branch was unpushed, so `module/packs/` was stripped from every commit and rebuilt.
`npm run verify` now fails if any pack is not a fresh compile -- the tell is the LevelDB file
numbering, since `pack.mjs` `rm -rf`s the destination and a real compile always yields exactly
`000005.ldb` + `MANIFEST-000002`. Close Foundry, `npm run pack`, then commit.

**A failed build is destructive.** Every builder deletes its whole output directory _before_
writing, so a crash mid-build leaves `src/<pack>/` gutted (this is how the v1.4.0 folder-document
regression wiped 433 actor files). Commit before rebuilding; `git checkout -- src/` is the recovery.

## Hard invariants

- **`src/` holds two different kinds of content, split into two top-level subdirectories.**
  - _Generated_ (`src/generated/{monsters,spells,items,journals,spell-lists,backgrounds}`):
    `build/convert-monster-json/main.ts`, `build_spells.py`, `build_items.py`, `build_journal.py` and friends each
    **delete every `*.json`** in their target directory before writing. Hand-edits survive only
    until the next build — fix things in the build script instead -- see the escape-hatch tables
    in `docs/internals/build-pipeline.md`.
  - _Hand-maintained_ (`src/authored/{classes,class-features,races,feats,new-equipment,summons}`):
    649 documents merged from GoC45's `wc5e-ccc` module, with dnd5e advancement configured. **No
    generator produces these** — they are the source of truth and must be edited directly. Never
    add a "clean `src/`" step; keep every builder scoped to its own subdirectory.
- **Document `_id`s are deterministic**: sha1 of a name-derived key rendered into 16 base62 chars
  (`make_id()` in each builder, `folders.fid()` for folders). This keeps ids stable across
  rebuilds so worlds don't lose references. Never randomise them, and don't change the hashed
  key strings for existing documents.
- **Every document needs a `_key`** (`!actors!<id>`, `!items!<id>`, `!actors.items!<actor>.<item>`,
  `!journal.pages!<j>.<p>`, `!folders!<id>`) — the Foundry CLI uses it to route the document.
- **`_stats: {systemId: "dnd5e", systemVersion: "5.3.3"}`** is written on every document and
  `rules: "2014"` on every `source`. Bumping the target dnd5e version means updating these
  literals in all builders plus `module.json` `relationships`.
- **Bump `module.json` `version`** whenever packs change, or Foundry won't pull the update for
  users (see commit `3cc6182`).
- **`download` must be version-pinned to a release asset**, never a branch. It previously pointed
  at `archive/refs/heads/main.zip`, which made version numbers meaningless — every installer got
  whatever `main` happened to be, regardless of the version in the manifest. `release.mjs` refuses
  to build if `download` doesn't end with `/releases/download/v<version>/module.zip`.

## The validator is the safety net, not determinism

`npm run verify` (`build/verify.py`) is the gate. It matters because the module mixes generated and
hand-maintained content, and _only_ generated content gets determinism as a regression test
("rebuild, `git status` clean"). Every check works identically on hand-authored documents, which is
what makes editing the class content by hand safe.

Each check corresponds to a bug that actually shipped or was caught late, and most of these fail
**silently in Foundry** — no error, no prompt, just nothing happening:

- internal `Compendium.wc5e-foundryvtt.*` references all resolve (a broken `ItemGrant` is a no-op)
- no surviving `wc5e-ccc` references, no duplicate `_id` inside a pack, `_key` present and shaped
- every `modules/wc5e-foundryvtt/…` asset exists on disk
- `flags.dnd5e.spellLists` is present, every entry resolves to a page of type `spells`, **and every
  page in the pack is registered** (an unregistered list is inert)
- every `ItemChoice(spell)` restriction names a _registered_ list identifier, and has either a list
  or a pool
- advancement on non-class items isn't keyed above level 1 (flows run 0..current)
- no document cites a URL as its source book; every source is declared in `flags.dnd5e.sourceBooks`
- every spell we ship is reachable from at least one class list
- `download` matches `version`, `manifest` is the `releases/latest` form

It is fault-injection tested: removing the spellLists flag, putting a URL in a source book,
duplicating an advancement id, pointing an `ItemGrant` at a missing document, and mismatching
version/download are all caught. **If you add a check, break something on purpose and confirm it
fires** — a validator that only ever passes is worthless.

## The auto-assign tool (the only runtime JavaScript)

Non-SRD spells can't be bundled, so 153 monster spell references and 221 spell-list entries ship
blank. `module/scripts/auto-assign/` is a GM-facing tool that searches compendiums the GM ticks,
assigns what it finds, and reports what it doesn't. Only _names_ are in the repo; the documents
come from the user's own content.

Three things to know before touching it — the rest is in `docs/internals/auto-assign.md`:

- **`module/assets/missing-spells.json` is generated** by `build/missing_spells.py`, and **three
  builders each own a section of it**, so each replaces only its own.
- **`normaliseName()` in `manifest.mjs` is a port of `spell_embed._norm()`.** If they drift, every
  lookup misses and the tool silently finds nothing. Two tests pin it from either side; keep both
  passing.
- **Never commit `module/packs/` written by a running Foundry** — see the invariant above.

`npm test` runs both suites (`python3 -m unittest`, `node --test`), stdlib only.

## Licensing constraint (affects design, not just credits)

Only **WC5E community content** and **SRD 5.1** (CC-BY-4.0, as shipped with the dnd5e system) may
be bundled. Non-SRD spells (Tasha's/Xanathar's-era, ~23% of monster spell references) must stay
as plain text in the Spellcasting trait and never be reproduced as items. `reference/srd-index/srd_spells_2014.json`
is the SRD index used for embedding. See `LICENSE.md` — build scripts are MIT, content is not.

## Planned work (roadmap in README.md and the in-module journal)

Backgrounds, races, classes & subclasses, feats, per-monster token art, and wiring the remaining
non-SRD spells. Races/classes need dnd5e **advancement** configuration and are being done manually.

Adding a new pack requires five coordinated edits:

1. `module/module.json` → `packs[]` entry (+ add the name to `packFolders[0].packs`)
2. `build/pack.mjs` → add the name to `PACKS`
3. `build/build_<thing>.py` → emit `src/generated/<name>/*.json` (deterministic ids, `_key`, `_stats`, folders)
4. `package.json` → a script for it, wired into `build`
5. `README.md` + `build/build_journal.py` roadmap/contents text, and bump `module/module.json` version
