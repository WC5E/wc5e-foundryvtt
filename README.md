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
`assets/`). Cloning the repo instead also works, but brings the `module/`,
`build/`, `src/` and `reference/` trees, which exist purely to regenerate the packs.

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

**WC5E Backgrounds:** 4 new backgrounds from the _Heroes' Handbook_. Starting equipment is listed in the description, and not directly wired into automted equipment selection.

**WC5E Class Spell Lists:** dnd5e spell lists for all casting classes in the project. It is wired up with all spells from the project, as well as the system's own SRD spells. Non-SRD spells can't be bundled (see auto-assigning spells, above).

**WC5E Guide:** A short in-module journal: what's included, how to use it,
roadmap and credits.

## Current Known Issues

The following is a short-list of things that are known to not be as expected. It should be cleared up when possible.

| Topic                                                 | Issue                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom Languages Not Added**                        | There's currently no support for custom languages, so they won't be added automatically on character creation. Suggested workaround is to add them manually as a 'special' language.                                                                                                                                                                                                               |
| **Warlock cantrips**                                  | Warlocks get too many cantrips to start with. It should be 2 cantrips, currently they start with 3 in this module.                                                                                                                                                                                                                                                                                 |
| **Warlock Demon Features**                            | _Demonic Knowledge_ provides Demonic Cores regardless, Grimoire of Servitude usage not properly modelled.                                                                                                                                                                                                                                                                                          |
| **Enhancement, Path of Feral not being Half Casters** | The dnd5e module doesn't support a regressive spellcasting subclass structure. This would have to be resolved by making Feral and Enhancement their own classes in this module, though may be easier to just play them as full casters. The only thing that would be a challenge with this is the availability of the "Ravage" and "Stormstrike abilities, as they are intended for a half caster. |
| **Backgrounds**                                       | The Faction Fostered background gets a 'hooded cloak' that is not present as adventuring gear, so it has to be added some other way or removed from the background.                                                                                                                                                                                                                                |
| **Unreleased Equipment**                              | Some unreleased equipment has snuck into the build; there are some extra types of shields that were experimental content. Will need to do some cleanup.                                                                                                                                                                                                                                            |
| **Broken Monster Features**                           | Some monster features aren't working as expected, and will instead just have their text presented without getting any attack, save, or damage macros assigned.                                                                                                                                                                                                                                     |

## Other Known Limitations

- There are many monster abilities that are not automated. However, all the text from these abilities is present, so
no part of the monster feature is lost.

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

Monster actors are generated from the committed `reference/parsed/wc5e-mom-full.json`
source. Spells, items, and the guide are generated from WC5E markdown, so that
pipeline can be re-run — after a dnd5e update, when upstream adds content, or to
tweak the conversion. The player options
(`src/authored/{classes,class-features,races,feats,new-equipment,summons}`) are instead
hand-maintained documents with dnd5e advancement configured: no generator
produces them, so edit those files directly.

Requirements: **Node 18+**, **Python 3**, and a clone of the upstream
conversion **as a sibling directory**:

```bash
git clone https://github.com/WC5E/Warcraft-5e-Conversion ../Warcraft-5e-Conversion
npm install          # installs the Foundry CLI (only dependency)
npm run build        # spells → actors → items → journal → pack
```

The markdown builders read `WIP 3.0 Chapters/Chapter 6 Spells.md` and the Heroes
Handbook from that sibling clone. Because `src/` is committed, you can recompile
the packs (`npm run pack`) and work on the item/journal builders **without** the
upstream clone.

| Command           | What it does                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run spells`  | `build/extract_spells.py` + `build/build_spells.py`: WC5E custom spells → `src/generated/spells/*.json`      |
| `npm run actors`  | `build/build-actors/main.ts`: `wc5e-mom-full.json` → `src/generated/monsters/*.json` (spells embedded)         |
| `npm run items`   | `build/build_items.py`: authors `src/generated/items/*.json` (hand-transcribed gear tables)                  |
| `npm run journal` | `build/build_journal.py`: the in-module guide → `src/generated/journals/*.json`                              |
| `npm run pack`    | `build/pack.mjs`: `src/{generated,authored}/*` → LevelDB packs under `module/packs/`                          |

`spells` must run before `actors`: caster monsters get their spells embedded from
`src/generated/spells/`, so building actors first bakes in stale spell data. Rebuilds are
deterministic — identical inputs give byte-identical output.

`node build/_chk.mjs` extracts the compiled packs back out and prints document
counts as a sanity check.

### Layout

```
wc5e-foundryvtt/
├── module/                  # everything module.json references -- ships as-is
│   ├── module.json          # Foundry manifest
│   ├── packs/<pack>/        # compiled LevelDB compendiums (what Foundry loads)
│   ├── assets/, lang/       # bundled default token emblem, localization
│   └── scripts/, templates/, styles/  # the auto-assign runtime feature
├── src/
│   ├── generated/<pack>/*.json   # builder-owned, rewritten on every build
│   └── authored/<pack>/*.json    # hand-maintained player options, edited directly
├── reference/               # copies of the source material being transpiled
│   ├── parsed/              # parsed statblock / spell JSON
│   ├── pdf-extracts/        # committed pdftotext output
│   └── srd-index/           # SRD name→id lookup tables
└── build/                   # the conversion pipeline
```

> **`src/` is generated output, not source** for everything under `src/generated/`.
> Each builder deletes and rewrites its target directory, so hand-edits there are
> lost on the next build. Fix conversions in the `build/` scripts instead.
> `src/authored/` is the opposite: no generator touches it, so it's safe to edit
> directly. See **CLAUDE.md** for the build invariants (deterministic document
> ids, `_key` fields, pinned dnd5e version) before changing the pipeline.

## Token art

Every monster uses a single bundled emblem (`assets/default-token.svg`) for both
portrait and token, so the bestiary looks consistent out of the box. Per-monster
art was left out because the community source only has loosely-placed page
illustrations, not tokens, and auto-matching them proved unreliable. To give a
monster its own art, set its image on the actor in Foundry (or edit `img` /
`prototypeToken.texture.src` in its `src/generated/monsters/*.json` and re-pack).
