# Auto-Assign Spells — design

**Date:** 2026-08-01
**Status:** approved, not yet implemented

## Problem

The module cannot ship non-SRD spells (Xanathar's, Tasha's, and the non-SRD parts of the PHB),
so two gaps are baked into every install:

| Target | Gap |
|---|---|
| Monster actors | 154 unresolved spell references across **61** of the 88 caster monsters, **54** distinct names |
| Class spell lists | **224** omitted entries across the 10 spell-list pages, **138** distinct names |

Today those names survive only as prose — inside the monster's Spellcasting trait text, and in each
spell-list page's description ("…are not included in this module…"). A GM who *owns* the content
still has to find every one of them by hand.

The fix is a GM-facing tool, shipped with the module, that searches compendiums the user selects,
assigns what it finds, and reports what it could not find. Users who don't own the content lose
nothing; users who do get the gap closed in one click. The not-found list is useful on its own —
it tells someone who owns Xanathar's but hasn't imported it into this world exactly what is absent.

## Non-goals

- Shipping any non-SRD spell content. Only *names* are added to the repo.
- Naming, detecting, or special-casing any particular content source.
- Automatic execution. The tool only ever runs when a GM asks it to.
- Repairing anything the user has edited. Writes are additive only.

## Approach

The Python builders already compute the unresolved-name sets. Rather than re-deriving them in
JavaScript at runtime by parsing rendered HTML — which would duplicate ~150 lines of fragile regex
in a second language and drift silently — the builders **emit a manifest at build time** and the
runtime code does lookup and writes only.

Rejected alternative: runtime parsing of the statblock trait text. No upside, and it puts the
parser's correctness beyond the reach of `npm run verify`.

## Architecture

Three units with narrow interfaces.

### 1. Build side — the manifest

A shared collector module (`build/missing_spells.py`) accumulates records and writes
`assets/missing-spells.json`. Contributors:

- `build/spell_embed.py` — currently `embed_spellcasting()` returns unmatched names as bare
  normalised strings. It must instead yield records carrying the original spelling and the
  casting context, so `parse_spellcasting()` stops discarding the raw name (it currently does
  `names = [_norm(x) for x in ...]`; it must keep `(raw, key)` pairs).
- `build/build_spell_lists.py` — already has `missing` as `(name, kind)` pairs per page.
- `build/build_subclass_spells.py` — already has `missing` as names per page.

Schema (`version` guards future changes; a runtime that sees an unknown version refuses to run
rather than misbehaving):

```json
{
  "version": 1,
  "aliases": { "call lighting": "call lightning" },
  "monsters": {
    "<actorId>": {
      "name": "Frost Revenant",
      "pack": "monsters",
      "spells": [
        { "name": "Ice Knife", "key": "ice knife", "prep": "prepared", "level": 1, "perDay": null },
        { "name": "Shape Water", "key": "shape water", "prep": "atwill", "level": 0, "perDay": null }
      ]
    }
  },
  "spellLists": {
    "<journalId>.<pageId>": {
      "name": "Mage Spells",
      "identifier": "wc5e-mage",
      "pack": "spell-lists",
      "spells": [ { "name": "Synaptic Static", "key": "synaptic static", "source": "XGE" } ]
    }
  }
}
```

There is deliberately no module-version field: it would make the manifest change on every
version bump and turn a bump into a mandatory rebuild. The runtime reads the version from
`game.modules.get("wc5e-foundryvtt").version`.

`aliases` is the existing `spell_embed.ALIAS` table, serialised so the JS normaliser cannot drift
from the Python one. `key` is the pre-normalised lookup key; `name` is the original spelling, used
for display. `prep` is one of `prepared` / `atwill` / `innate`, mirroring
`spell_embed._embed_item()`; `perDay` is set only for `innate`.

Known data-quality item to clean up while implementing: one parsed entry is currently the garbage
string `shadow bolt 1st-5th level : arms of hadar`, a mis-split of a statblock line. It must not
reach the manifest.

`build/verify.py` gains a check: the manifest parses, its `version` is known, every `monsters` key
resolves to an actor id in `src/monsters`, every `spellLists` key resolves to an existing
journal/page pair, no record has an empty `name` or `key`. Fault-inject it (point one entry at a
deleted id) and confirm it fires, per the repo's standing rule.

### 2. Runtime — search index

Given a set of selected pack ids, build a normalised-name → match map. Each pack is indexed with
`pack.getIndex({ fields: ["type", "system.level", "system.school"] })` and filtered to
`type === "spell"`. **Indexing is lazy** — only ticked packs are read, so a large collection costs
nothing unless selected.

Normalisation is a JS port of `spell_embed._norm()`: lowercase, strip `^XGE^`-style superscripts,
strip `✦`/`*`, drop parenthesised suffixes, collapse whitespace, then apply `aliases`.

First match wins in tree order, so the picker's ordering is the user's priority order. The report
records which pack each match came from, making a wrong match visible rather than silent.

### 3. Runtime — plan and apply

**Plan** is a pure function: manifest + index + targets + destination → a list of intended writes
plus a not-found list. Nothing is written during planning, which is what makes the preview
trustworthy.

**Apply** executes the plan:

- *Monsters (compendium)* — `pack.configure({ locked: false })`, `getDocument(id)`,
  `createEmbeddedDocuments("Item", [...])`, re-lock in a `finally` so a mid-run failure cannot
  leave the pack unlocked. Each created item is the user's own spell document with
  `system.preparation.mode` set from `prep`, and `system.uses` set from `perDay` for `innate`,
  matching what `spell_embed._embed_item()` does at build time.
- *Monsters (world)* — actors whose `_stats.compendiumSource` points into this module's `monsters`
  pack, same embedded-item write. Fall back to the legacy `flags.core.sourceId` for actors imported
  under older Foundry versions.
- *Spell lists* — add the found spell's **UUID** to the page's `system.spells` set. Nothing is
  copied; the list points at the user's own document.

**Spell lists exist only in the compendium.** There is no world-side copy, so the *Spell lists*
target is incompatible with the *World actors only* destination: selecting that destination
disables the target in the dialog with an inline note, and a plan built from that combination
contains no list writes. This is a UI-level constraint, not a silent skip.

**Additive and idempotent.** A spell already present on the actor by normalised name is skipped.
Nothing is ever removed or overwritten, so a hand-tweaked monster is safe. Running twice reports
zero additions the second time — this is the primary correctness check.

**Failure handling.** A pack that fails to index is skipped with a warning and named in the report.
A pack that cannot be unlocked aborts that destination with an explicit error rather than partially
applying. A missing or unparseable manifest disables the menu with a clear message instead of
throwing during `init`.

## User interface

The module gains runtime JavaScript for the first time — one `esmodules` entry. `scripts` and
`templates` join `RUNTIME` in `build/release.mjs` so they reach the release zip.

```
scripts/wc5e.mjs                  entry: settings, menu registration, first-run prompt
scripts/auto-assign/manifest.mjs  load + validate the manifest, normalisation
scripts/auto-assign/index.mjs     build the search index from selected packs
scripts/auto-assign/plan.mjs      plan (pure) + apply
scripts/auto-assign/app.mjs       ApplicationV2 dialog
templates/auto-assign/*.hbs
```

`ApplicationV2` + `HandlebarsApplicationMixin`, which is available across the declared v13–v14
compatibility range.

### The dialog

One window, three stages: **configure → preview → report**.

*Configure* holds three controls:

1. **Targets** — checkboxes for *Monsters* and *Class spell lists*, each labelled with its count
   from the manifest. Both default on.
2. **Destination** — *Compendium + World Actors* (default) / *Compendium only* / *World actors only*.
3. **Search in** — a tree of compendium folders and the Item packs inside them, mirroring the
   sidebar so nested folders (e.g. `DBB Core Source → DBB Core Source Spells`) appear where the
   user expects. Checkbox per node; checking a folder checks its whole subtree, and unchecking any
   descendant puts the folder into an **indeterminate** state rather than clearing it — only the
   ticked packs are searched. Expand/collapse to navigate in and out. Selecting nothing is a
   validation error, not an empty run.

*Preview* shows the plan — for example "will add 148 spells to 58 monsters and 201 list entries;
26 not found" (illustrative; the real numbers depend on what the user owns) — with an **Apply**
button and a back link.

*Report* shows what was assigned (grouped by monster / list, with the source pack per spell) and
the not-found list grouped by source book, with copy-to-clipboard. The not-found list is the
deliverable for users who own content they haven't imported.

### Settings

Registered under the `wc5e-foundryvtt` namespace, all world-scoped, all `config: false` except the
menu itself:

| Key | Purpose |
|---|---|
| `autoAssign.searchPacks` | selected pack ids, so a re-run is one click |
| `autoAssign.targets` | `{ monsters, spellLists }` |
| `autoAssign.destination` | `both` / `compendium` / `world` |
| `autoAssign.promptDismissed` | set by "Don't show again" |
| `autoAssign.lastPromptedVersion` | module version the prompt last fired for |

`game.settings.registerMenu` adds **Auto-Assign Spells** to the module settings.

### First-run prompt

Shown to a GM on `ready` when all of: the user is a GM, `promptDismissed` is false, the module
version differs from `lastPromptedVersion`, and the manifest is non-empty. Three buttons:
**Run it now** (opens the dialog) / **Later** / **Don't show again**.

The version condition is deliberate. **A module update replaces `packs/`, so compendium-side
assignments are lost on upgrade and the tool must be re-run.** The prompt reappearing after an
update is how the user finds that out; the remembered pack selection is what makes the re-run
cheap. This caveat is also stated in the report and in the module's Read Me journal.

## Verification

There is no test suite in this repo and no way to drive the Foundry UI headlessly, so verification
is split:

**Automated** (`npm run verify`): the manifest check described above, plus the existing gate. A
rebuild must leave `git status` clean, since the manifest is generated and therefore deterministic.

**Manual checklist**, run in the `warcraft` world against Foundry v14 / dnd5e 5.3.3:

1. Fresh GM login shows the prompt; "Don't show again" suppresses it on reload.
2. The picker's tree matches the compendium sidebar, including nested folders.
3. Ticking a folder ticks its subtree; unticking one node unticks the folder.
4. Preview counts match the report counts after Apply.
5. A monster with a known gap gains exactly the missing spells, with the right preparation mode,
   and keeps everything it already had.
6. Running a second time reports zero additions.
7. A hand-added spell on a monster survives a run.
8. With no relevant packs selected, everything lands in the not-found list and nothing is written.
9. After Apply, the packs are locked again.
10. A player (non-GM) sees neither the prompt nor the menu.

## Out of scope for this spec

- An on-import hook that completes monsters dragged out later. The button covers the need; the
  hook is a possible follow-up.
- Any fix for the build-time SRD index gap noticed while sizing this work — *thunder wave*,
  *witch bolt*, *chromatic orb*, *thorn whip*, *blade ward* and *friends* appear unresolved despite
  looking like SRD 5.1 content. That is a separate bug in `build/data/srd_spells_2014.json` or in
  name matching, and should be fixed at build time rather than papered over by this tool.
