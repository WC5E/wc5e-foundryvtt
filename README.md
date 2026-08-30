# Warcraft 5e (WC5E) for Foundry VTT

> ### ⚠️ This module is currently in Beta
>
> This module is still a **beta** release. It is playable, but there may still be issues. If you find a problem, check out "I found an issue!" below.

This is a Foundry VTT compendium for playing content from the [Warcraft 5E (WC5E)](https://github.com/WC5E/Warcraft-5e-Conversion) project. The goal is for everything in that project to be present here and maintained together with updates to the underlying material.

The project started with a Foundry module set up by community members **Green Star** and **JunkTurkey**, converting a now older version of the player material to Foundry.

With Foundry now having its own CLI, and wanting for an automated translation from Markdown to JSON in order to then compile to Foundry VTT, we worked together with community member **Arthur** to set up this project.

Thanks to everyone involved so far. To Green Star and JunkTurkey for a tremendous groundwork, to Arthur for helping out with the workflow in this project, and pre-emptive thank you to anyone who might be seeing this and considering joining in to help out. 🧙

### The module has been tested with

- **Foundry VTT** v13–v14 (verified on v14)
- **dnd5e system** 5.3.3

> Fan content. Warcraft is a trademark of Blizzard Entertainment. This module is
> not affiliated with or endorsed by Blizzard or Wizards of the Coast. All WC5E
> text belongs to its respective authors — see
> [Attribution](LICENSE.md).

## I found an issue! What do I do?

If you've found what you've believed is a bug, either in this module or in the underlying content, you can raise a ticket to us one of the following ways.

1. [Open an issue](https://github.com/WC5E/wc5e-foundryvtt/issues) to us here on Github, if you have a Github account.
2. [Join our Discord](https://discord.gg/dKMJmmD) and tell us about it in the `#bug-reporting` channel.

## How to Install

### Option A — Manifest URL for Latest Release

This installs the latest tagged release and Foundry will offer an update
whenever a new one is published.

In Foundry: **Add-on Modules → Install Module**, paste this into the _Manifest
URL_ box at the bottom, and click **Install**.

```
https://github.com/WC5E/wc5e-foundryvtt/releases/latest/download/module.json
```

Then in your world: **Game Settings → Manage Modules** → enable
**Warcraft 5e (WC5E)**.

> If you want a specific release version, each release in this project comes with a link to that version's Manifest URL. If you want to lock to one version of the module for stability.

### Option B — Manual install

1. Download `module.zip` from the
   [latest release](https://github.com/WC5E/wc5e-foundryvtt/releases/latest)
   and extract it.
2. **Put the contents in a folder named `wc5e-foundryvtt`.** This matters: the
   module id is `wc5e-foundryvtt`, and monster token art is referenced as
   `modules/wc5e-foundryvtt/assets/…`, so a differently-named folder will load but
   show a broken image on every token.
3. Move it into your Foundry data modules folder:
   - **Windows:** `%localappdata%/FoundryVTT/Data/modules/`
   - **macOS:** `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Linux:** `~/.local/share/FoundryVTT/Data/modules/`
4. Restart Foundry, then enable the module under **Manage Modules**.

The release zip contains only what's needed to play (`module.json`, `packs/`,
`assets/`). Cloning the repo instead also works, but brings the `build/` and
`src/` trees, which exist purely to regenerate the packs.

## Using the Module

Open the **Compendium Packs** sidebar tab and find the **Warcraft 5e** group.
Drag monsters onto the canvas or into the Actors directory (attacks roll from
the sheet like any dnd5e NPC), and drag gear or spells onto a character sheet.

For player characters, drag a class and a race onto a blank sheet, where dnd5e's
advancement prompts will walk you through levelling. Start with the **WC5E
Guide** journal for a short in-module orientation.

### Using the Module with a Character Builder

Guided character-creation modules (Originate and similar) hardcode spellcasting
rules per SRD class, so they skip the spell step for a custom class no matter how
it's configured.

This module works around that by driving the choices through dnd5e's own advancement system instead, so levelling up on the standard sheet
prompts for cantrips and spells. If your builder also offers a spell-list
setting, point it at **WC5E Class Spell Lists** and map each caster.
The class identifiers are `wc5e-death-knight`, `wc5e-druid`, `wc5e-mage`,
`wc5e-paladin`, `wc5e-priest`, `wc5e-shaman`, `wc5e-warlock`.

Ability-score assignment and rolling for hit points are features of those
modules, not of this content. Check their own settings if a step is missing.

### Auto-assign spells you already own

Some spells WC5E references come from sourcebooks that can't be redistributed, so they ship as text only. 

If you own that content, **Settings → Module Settings → Auto-Assign Spells** will search compendiums you pick, add the spells it finds to the WC5E monsters and class spell lists, and show you a list of anything it couldn't find. Nothing is ever removed or overwritten, and it's safe to
run twice.

Updating the module replaces its compendiums, so run it again after an update. Your compendium selection is remembered.

## What's inside

**WC5E Monsters:** 400+ NPC actors, foldered by creature type. This includes monsters from the finished _Manual of Monsters_ as well as early conversions of work that has been in progress (marked as (WIP) in the module).

**WC5E Items:** All new weapons and gear from the _Heroes' Handbook_. 

**WC5E Spells:** All new custom WC5E spells. A few utility/buff spells have their full wording presented but are at the moment not auto-wired to roll. 

**WC5E Player Options:** dnd5e _advancement_ configured for all **12 classes**, **36 subclasses**, and **28 races** in the WC5E project. This also includes summon/pet statblocks. 

**WC5E Backgrounds:** 4 new backgrounds from the *Heroes' Handbook*. Starting equipment is listed in the description, and not directly wired into automted equipment selection. 

**WC5E Class Spell Lists:** dnd5e spell lists for all casting classes in the project. It is wired up with all spells from the project, as well as the system's own SRD spells. Non-SRD spells can't be bundled (see auto-assigning spells, above).

**WC5E Guide:** A short in-module journal: what's included, how to use it,
roadmap and credits.

## Content that needs checking

The conversion pulls from two sources that disagree: the WC5E GitHub repository and the class PDFs on the team's Drive. **Neither is consistently newer** — most PDFs were printed in 2020, but three (Mage 3.1, Priest 3.1.1, Demon Hunter) are newer than their repo files, and a January 2026 repo commit that touched 8 class files turned out to be **CSS only**, so commit dates overstate how current the markdown is.

Everything below is a deliberate choice with a reason, not an oversight — but if you know which version is canonical, please say so in an issue.

| Content                          | What's shipped                                   | Why it's uncertain                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Subtlety rogue**               | _Subtle Magic_ — fixed spells at rogue 3/7/11/15 | From the Sept 2020 PDF. The repo instead has an unfinished third-caster design referencing a "subtlety spell list" that was never written. Older but playable beat newer but unimplementable.                      |
| **Priest Divine Words**          | picks at levels 2/5/9/13/17                      | Matches the Priest 3.1.1 PDF (Jan 2026), which is newer than the repo. Earlier builds used 2/5/10/14.                                                                                                              |
| **Warlock cantrips**             | 3 at level 1                                     | The repo table says 3, the 2021 PDF says 2.                                                                                                                                                                        |
| **Warlock "Demons Known"**       | not modelled                                     | The PDF has a column for it with no equivalent in the repo.                                                                                                                                                        |
| **Enhancement, Path of Feral**   | no spell-selection prompts                       | Each _replaces_ its parent class's progression, and dnd5e advancement can't be made conditional on subclass — adding their tables would double-grant on top of the class's prompts. Spell slots are still correct. |
| **Life Tap, Extra Attack (2)**   | uses don't scale automatically                   | The feature text states the progression; wiring it risks resolving to zero uses silently.                                                                                                                          |
| **153 monster spell references** | listed as text, not embedded                     | Non-SRD spells (Xanathar's/Tasha's) that can't legally be bundled. Each caster's Spellcasting entry names them. **Auto-Assign Spells** (above) will fill these in from your own compendiums.                       |
| **Backgrounds**                  | 4, from the Heroes' Handbook                     | That's all that exist upstream. A "hooded cloak" has no dnd5e item, so it stays in the description.                                                                                                                |

## Conversion notes & known limitations

- **Attacks** (`Melee/Ranged Weapon/Spell Attack`) are built as rollable
  activities with a _flat_ to-hit and the exact damage dice from the statblock,
  so rolls match the book regardless of ability modifiers.
- **Save abilities** (breath weapons, AoEs) roll a save at the literal printed
  DC, with damage and half-on-success where the text says so.
- **Other actions** (Multiattack, save-or-suck oddities) are features with a
  utility activity so they appear in the right sheet section and can be posted to
  chat; the mechanics live in the description text.
- **Spellcasting** monsters have their spells embedded and rollable: the build
  sets each caster's spellcasting ability, spell slots and a DC bonus so the
  printed statblock DC is honoured, and bakes in every spell it can resolve —
  **~77% of references** (WC5E custom spells + dnd5e SRD spells) — with the
  correct prepared / at-will / X-per-day mode. The remaining ~23% are **non-SRD
  spells** (Tasha's/Xanathar's-era, e.g. _shape water, cause fear, mold earth_)
  that can't legally be bundled; they stay listed in the Spellcasting feature
  text (customs marked `✦`). If your world has those spells from official
  content, drag them on manually.
- **Damage resistances "from nonmagical attacks"** map to the proper physical
  types plus the _magical bypass_ flag.
- Where an ability isn't fully automated, its **full text is always present** —
  nothing from the book is lost.

## Roadmap

**Done**

- [x] Classes, subclasses, races, class features & feats (advancement configured)
- [x] Class spell lists for all 7 casters
- [x] Backgrounds
- [x] Summons & pets
- [x] Monsters — 420 NPCs, foldered by creature type
- [x] Monster attacks & save abilities (breath weapons etc.) rollable
- [x] Monster spellcasting embedded (~79% of references)
- [x] Weapons, firearms, shields, ammunition
- [x] Explosives & adventuring gear
- [x] Full WC5E custom spell list (101 spells), foldered by level
- [x] Spell mechanics — attack rolls, saves, damage, healing, area templates,
      upcast scaling, summons and Active Effects
- [x] Compendium folders + in-module guide journal

**Future Potential**

- [ ] Per-monster / creature token art

Suggestions, bug reports and corrections are welcome via issues.

## Rebuilding from source

The monsters, spells, items and guide are generated from the WC5E markdown, so
that pipeline can be re-run — after a dnd5e update, when upstream adds content,
or to tweak the conversion. The player options
(`src/{classes,class-features,races,feats,new-equipment,summons}`) are instead
hand-maintained documents with dnd5e advancement configured: no generator
produces them, so edit those files directly.

Requirements: **Node 18+**, **Python 3**, and a clone of the upstream
conversion **as a sibling directory**:

```bash
git clone https://github.com/WC5E/Warcraft-5e-Conversion ../Warcraft-5e-Conversion
npm install          # installs the Foundry CLI (only dependency)
npm run build        # parse → spells → actors → items → journal → pack
```

The parsers read `Manual of Monsters, Main File.txt`, `WIP Manual of Monsters/`
and `WIP 3.0 Chapters/Chapter 6 Spells.md` from that sibling clone. Because
`src/` is committed, you can recompile the packs (`npm run pack`) and work on the
item/journal builders **without** the upstream clone.

| Command           | What it does                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run parse`   | `build/parse.py`: statblocks → `intermediate/monsters.json` + `monsters_wip.json`                            |
| `npm run spells`  | `build/extract_spells.py` + `build/build_spells.py`: WC5E custom spells → `src/spells/*.json`                |
| `npm run actors`  | `build/build_actors.py`: intermediate → `src/monsters/*.json` (main + net-new WIP, deduped, spells embedded) |
| `npm run items`   | `build/build_items.py`: authors `src/items/*.json` (hand-transcribed gear tables)                            |
| `npm run journal` | `build/build_journal.py`: the in-module guide → `src/journals/*.json`                                        |
| `npm run pack`    | `build/pack.mjs`: `src/*` → LevelDB packs under `packs/`                                                     |

`spells` must run before `actors`: caster monsters get their spells embedded from
`src/spells/`, so building actors first bakes in stale spell data. Rebuilds are
deterministic — identical inputs give byte-identical output.

`node build/_chk.mjs` extracts the compiled packs back out and prints document
counts as a sanity check. `python3 build/validate_wip.py` reports incomplete or
duplicated WIP statblocks.

### Layout

```
foundry-wc5e/
├── module.json              # Foundry manifest
├── packs/<pack>/            # compiled LevelDB compendiums (what Foundry loads)
├── src/<pack>/*.json        # generated, human-readable Foundry documents
├── intermediate/            # parsed statblock / spell JSON (build artifacts)
├── build/                   # the conversion pipeline
└── assets/                  # bundled default token emblem
```

> **`src/` is generated output, not source.** Each builder deletes and rewrites
> its target directory, so hand-edits there are lost on the next build. Fix
> conversions in the `build/` scripts instead. See **CLAUDE.md** for the build
> invariants (deterministic document ids, `_key` fields, pinned dnd5e version)
> before changing the pipeline.

## Token art

Every monster uses a single bundled emblem (`assets/default-token.svg`) for both
portrait and token, so the bestiary looks consistent out of the box. Per-monster
art was left out because the community source only has loosely-placed page
illustrations, not tokens, and auto-matching them proved unreliable. To give a
monster its own art, set its image on the actor in Foundry (or edit `img` /
`prototypeToken.texture.src` in its `src/monsters/*.json` and re-pack).
