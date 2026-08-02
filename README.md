# Warcraft 5e (WC5E) for Foundry VTT

> ### ⚠️ Beta — in active development
>
> This is the WC5E project's Foundry VTT module. It is a **beta**: the content is
> complete but still being curated, and things will change as people play through
> it and report what is wrong.
>
> **Found a problem? [Open an issue](https://github.com/WC5E/wc5e-foundryvtt/issues).**
> That's the fastest way to get it fixed, and it means nothing gets lost in chat.

> ### Coming from `wc5e-bestiary`?
>
> This module was previously published from a personal repository under the id
> `wc5e-bestiary`. It now lives here as `wc5e-foundryvtt`, which Foundry treats as
> an entirely **different module** — there is no automatic update path.
>
> Install this one, then disable and uninstall the old one. Compendium content is
> unchanged, but anything you had already **dragged into a world** still points at
> the old module: those actors and items keep working, and re-dragging them from
> the new compendiums is the way to move them across. Do it before uninstalling if
> you want to compare.

Compendium content for playing in the world of **Warcraft** on Foundry VTT,
converted from the community
[Warcraft 5e (WC5E)](https://github.com/WC5E/Warcraft-5e-Conversion) project to
the **dnd5e** system.

**Foundry VTT** v13–v14 (verified on v14) · **dnd5e system** 5.3.3

The goal is a **complete WC5E module** — everything you need to run a Warcraft
campaign without hand-entering content. Monsters, spells, items and the full set
of player options — classes, subclasses, races, feats, backgrounds and class
spell lists — are all in. See [Roadmap](#roadmap).

> Fan content. Warcraft is a trademark of Blizzard Entertainment. This module is
> not affiliated with or endorsed by Blizzard or Wizards of the Coast. All WC5E
> text belongs to its respective authors — see
> [Attribution](#attribution--license).

## Known content uncertainties

The conversion pulls from two sources that disagree: the WC5E GitHub repository and the
class PDFs on the team's Drive. **Neither is consistently newer** — most PDFs were printed
in 2020, but three (Mage 3.1, Priest 3.1.1, Demon Hunter) are newer than their repo files,
and a January 2026 repo commit that touched 8 class files turned out to be **CSS only**, so
commit dates overstate how current the markdown is.

Everything below is a deliberate choice with a reason, not an oversight — but if you know
which version is canonical, please say so in an issue.

| Content | What's shipped | Why it's uncertain |
|---|---|---|
| **Subtlety rogue** | *Subtle Magic* — fixed spells at rogue 3/7/11/15 | From the Sept 2020 PDF. The repo instead has an unfinished third-caster design referencing a "subtlety spell list" that was never written. Older but playable beat newer but unimplementable. |
| **Priest Divine Words** | picks at levels 2/5/9/13/17 | Matches the Priest 3.1.1 PDF (Jan 2026), which is newer than the repo. Earlier builds used 2/5/10/14. |
| **Warlock cantrips** | 3 at level 1 | The repo table says 3, the 2021 PDF says 2. |
| **Warlock "Demons Known"** | not modelled | The PDF has a column for it with no equivalent in the repo. |
| **Enhancement, Path of Feral** | no spell-selection prompts | Each *replaces* its parent class's progression, and dnd5e advancement can't be made conditional on subclass — adding their tables would double-grant on top of the class's prompts. Spell slots are still correct. |
| **Life Tap, Extra Attack (2)** | uses don't scale automatically | The feature text states the progression; wiring it risks resolving to zero uses silently. |
| **153 monster spell references** | listed as text, not embedded | Non-SRD spells (Xanathar's/Tasha's) that can't legally be bundled. Each caster's Spellcasting entry names them. **Auto-Assign Spells** (above) will fill these in from your own compendiums. |
| **Backgrounds** | 4, from the Heroes' Handbook | That's all that exist upstream. A "hooded cloak" has no dnd5e item, so it stays in the description. |

---

## Install

### Option A — Manifest URL (recommended)

In Foundry: **Add-on Modules → Install Module**, paste this into the *Manifest
URL* box at the bottom, and click **Install**:

```
https://github.com/WC5E/wc5e-foundryvtt/releases/latest/download/module.json
```

Then in your world: **Game Settings → Manage Modules** → enable
**Warcraft 5e (WC5E)**.

This installs the latest tagged release and Foundry will offer an update
whenever a new one is published. Each release ships a fixed `module.zip`, so a
given version number always means the same content.

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

### Using it with a character builder

Guided character-creation modules (Originate and similar) hardcode spellcasting
rules per SRD class, so they skip the spell step for a custom class no matter how
it's configured. This module works around that by driving the choices through
dnd5e's own advancement system instead, so levelling up on the standard sheet
prompts for cantrips and spells. If your builder also offers a spell-list
setting, point it at **WC5E Class Spell Lists** and map each caster.
The class identifiers are `wc5e-death-knight`, `wc5e-druid`, `wc5e-mage`,
`wc5e-paladin`, `wc5e-priest`, `wc5e-shaman`, `wc5e-warlock`.

Ability-score assignment and rolling for hit points are features of those
modules, not of this content — check their own settings if a step is missing.

### Using it

Open the **Compendium Packs** sidebar tab and find the **Warcraft 5e** group.
Drag monsters onto the canvas or into the Actors directory (attacks roll from
the sheet like any dnd5e NPC), and drag gear or spells onto a character sheet.
For player characters, drag a class and a race onto a blank sheet — dnd5e's
advancement prompts will walk you through levelling. Start with the **WC5E
Guide** journal for a short in-module orientation.

### Auto-assign spells you already own

Some spells WC5E references come from sourcebooks that can't be redistributed, so they ship as
text only. If you own that content, **Settings → Module Settings → Auto-Assign Spells** will search
compendiums you pick, add the spells it finds to the WC5E monsters and class spell lists, and show
you a list of anything it couldn't find. Nothing is ever removed or overwritten, and it's safe to
run twice.

Updating the module replaces its compendiums, so run it again after an update — your compendium
selection is remembered.

---

## What's inside

**WC5E Monsters** — 420 NPC actors, foldered by creature type, with full stats,
traits, actions, reactions and legendary actions. Weapon and spell attacks are
rollable using the exact statblock to-hit and damage; save-based abilities
(breath weapons and the like) roll their save at the printed DC. Every trait and
action also carries its complete descriptive text. This is 248 monsters from the
finished *Manual of Monsters* plus 172 net-new draft creatures from the *WIP
Manual of Monsters* (full dragonflights, demons, the Scourge, dinosaurs, NPCs
and more). WIP entries are tagged `Warcraft 5e - Manual of Monsters (WIP)` in
their source field; duplicates of finished monsters were skipped.

**WC5E Items** — 21 Warcraft-specific weapons and gear from the *Heroes
Handbook*: 6 exotic weapons (Battle Totem, Moon Sword, Moonglaive, Twinblade,
Warclaw, Warglaive), 2 firearms (Pistol, Rifle) using dnd5e's native
firearm/ammunition properties, 3 shields, firearm ammunition, 2 explosives
(Bomb, Dynamite — thrown, rollable Dex save) and 7 pieces of adventuring gear
(Bayonet, Beacon, Buzzbox, Firestarter, Flashlight, Glowstick, Parachute).
SRD-standard equipment is intentionally left out since the dnd5e system already
ships it.

**WC5E Spells** — the complete WC5E custom spell list (101 spells) as real dnd5e
spell items, foldered by level: correct level/school/components/duration, with
rollable attack / save / heal activities and slot scaling derived from each
spell's rules text (Solar Wrath, Pyroblast, Death and Decay, Chain Heal,
Bloodlust and Heroism, Army of the Dead, …). These are the Warcraft spells that
don't exist in core D&D; the SRD spells monsters also use ship with the dnd5e
system. A few utility/buff spells with unusual wording carry their full text but
aren't auto-wired to roll — open an issue and they're a quick fix.

**WC5E Player Options** — everything needed to build a Warcraft character, with dnd5e
*advancement* configured so levelling up actually grants features: **12 classes**
(Death Knight, Demon Hunter, Druid, Hunter, Mage, Monk, Paladin, Priest, Rogue,
Shaman, Warlock, Warrior), **36 subclasses/specialisations**, **28 races** including
sub-variants (Dark Iron / Ironforge / Wildhammer dwarves, four trolls, three tauren,
three orc clans, Lightforged and Broken draenei…), 443 class features, 90 race and
racial documents, 18 feats, class equipment, and 24 summon/pet statblocks. Created by
**GoC45** for the Character Creation Compendium and merged here with their permission.

**WC5E Backgrounds** — the 4 Heroes' Handbook backgrounds (Double Agent, Faction
Fostered, Kirin Tor Apprentice, Tribal Member), each as a dnd5e background item
that grants its skill proficiencies, prompts for tool and language choices, and
grants its feature as a separate item. Suggested-characteristics roll tables are
included. Starting equipment is listed in the description rather than wired into
dnd5e's structured equipment picker.

Casters also **prompt you to choose spells on level-up**, driven by each class's
Cantrips Known / Spells Known table — something dnd5e's own SRD classes don't do.

Subclasses grant their own spells too: the paladin oaths, druid paths, priest
priesthoods and shaman bindings hand out their spells automatically as
always-prepared, and the three warlock studies add an expanded list you can
choose from.

**WC5E Class Spell Lists** — dnd5e spell-list journal pages for all 7 casting
classes (Death Knight, Druid, Mage, Paladin, Priest, Shaman, Warlock), built from
the WC5E class spell tables. 671 spell links across the seven lists, mixing this
module's custom spells with the dnd5e system's SRD ones, so the character sheet
knows which spells each class can learn or prepare. Spells from non-SRD
sourcebooks can't be bundled — each list names the ones it had to omit so the gap
is visible in-game rather than silent.

**WC5E Guide** — a short in-module journal: what's included, how to use it,
roadmap and credits.

---

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

**Planned**

- [ ] Per-monster / creature token art
- [ ] Wire the remaining non-SRD spells (needs official content)

Suggestions, bug reports and corrections are welcome via issues — especially
from anyone who knows which version of a class or spell is canonical.

---

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

| Command             | What it does                                                        |
|---------------------|---------------------------------------------------------------------|
| `npm run parse`     | `build/parse.py`: statblocks → `intermediate/monsters.json` + `monsters_wip.json` |
| `npm run spells`    | `build/extract_spells.py` + `build/build_spells.py`: WC5E custom spells → `src/spells/*.json` |
| `npm run actors`    | `build/build_actors.py`: intermediate → `src/monsters/*.json` (main + net-new WIP, deduped, spells embedded) |
| `npm run items`     | `build/build_items.py`: authors `src/items/*.json` (hand-transcribed gear tables) |
| `npm run journal`   | `build/build_journal.py`: the in-module guide → `src/journals/*.json` |
| `npm run pack`      | `build/pack.mjs`: `src/*` → LevelDB packs under `packs/` |

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

---

## Conversion notes & known limitations

- **Attacks** (`Melee/Ranged Weapon/Spell Attack`) are built as rollable
  activities with a *flat* to-hit and the exact damage dice from the statblock,
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
  spells** (Tasha's/Xanathar's-era, e.g. *shape water, cause fear, mold earth*)
  that can't legally be bundled; they stay listed in the Spellcasting feature
  text (customs marked `✦`). If your world has those spells from official
  content, drag them on manually.
- **Damage resistances "from nonmagical attacks"** map to the proper physical
  types plus the *magical bypass* flag.
- Where an ability isn't fully automated, its **full text is always present** —
  nothing from the book is lost.

## Token art

Every monster uses a single bundled emblem (`assets/default-token.svg`) for both
portrait and token, so the bestiary looks consistent out of the box. Per-monster
art was left out because the community source only has loosely-placed page
illustrations, not tokens, and auto-matching them proved unreliable. To give a
monster its own art, set its image on the actor in Foundry (or edit `img` /
`prototypeToken.texture.src` in its `src/monsters/*.json` and re-pack).

## Attribution & License

**Player options** (classes, subclasses, races, class features, feats, equipment and
summons) were built by **GoC45** for the *WC5E Character Creation Compendium* and are
included here with their permission, coordinated through the WC5E project.

**WC5E content** (monsters, items, spells) is from the
[Warcraft 5e Conversion](https://github.com/WC5E/Warcraft-5e-Conversion),
created by the WC5E community; all rights to that conversion remain with its
authors. This module only reformats that text into Foundry documents. Please
credit and support the WC5E project.

**SRD spells** embedded on caster monsters are from the **System Reference
Document 5.1**, © Wizards of the Coast, used under **CC-BY-4.0** (as distributed
with the Foundry dnd5e system).

The build tooling under `build/` is MIT-licensed by the module author; the
bundled content is governed by its own sources. Full text in
[LICENSE.md](LICENSE.md).
