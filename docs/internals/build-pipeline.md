# Pipeline architecture


Three stages, each writing plain JSON so every step is inspectable:

```
../Warcraft-5e-Conversion/*.txt|md          upstream Homebrewery/GMBinder markdown
  → parse.py / extract_spells.py            → intermediate/*.json   (system-agnostic statblocks)
  → build_actors.py / build_spells.py /     → src/<pack>/*.json
    build_items.py / build_journal.py /       (one file per Foundry document, dnd5e 5.3.3 schema)
    build_spell_lists.py / build_backgrounds.py
  → pack.mjs (Foundry CLI compilePack)      → packs/<pack>/  (LevelDB)
```

The six player-option directories bypass this entirely — they are hand-maintained, not generated.

- **`parse.py`** knows nothing about Foundry. Its job is surviving the source's typesetting:
  blockquote-run statblock detection, `heal_blockquotes()` for author-forgotten `>` markers,
  merging column-split statblocks separated only by layout noise, en-dash normalisation.
- **`build_actors.py`** is the biggest converter (statblock → NPC actor). It imports
  `spell_embed` and `folders`.
- **`build_items.py`** is *hand-transcribed* data from the Heroes Handbook, not machine-parsed —
  edit the Python literals in `build()` to change gear.
- **`pack.mjs`** compiles every pack declared in `module.json`, `rm -rf`ing the destination first
  so deleted documents don't linger. It warns about a declared pack with no `src/` directory.


## dnd5e conversion conventions in use

- Statblock numbers are reproduced **exactly** rather than recomputed. Attacks use
  `attack.flat: true` with the printed to-hit; save abilities use
  `save.dc = {calculation: "", formula: "<DC>"}` — an *empty* `calculation` is what makes dnd5e
  honour the literal DC (a truthy value like `"flat"` makes it recompute `8+prof+mod`; see
  commit `7d2c0fa`).
- Every trait/action/reaction/legendary becomes a **`feat` item** whose description carries the
  full statblock text, so nothing is lossy even when unautomated. Passive traits get
  `properties: ["trait"]`; actions get an activity (`attack` → `save` → `utility` fallback) so
  they land in the right sheet section. Legendary preamble sets `resources.legact`.
- Saves/skills are expressed as proficiency plus a delta in `bonuses` so the printed total matches.
- Caster monsters (`spell_embed.py`) get `attributes.spellcasting`, `spells.spellN` slots, a
  `bonuses.spell.dc` delta to honour the printed DC, and embedded spell items with the right
  `preparation.mode` (`prepared` / `atwill` / `innate` + per-day `uses`).
- Compendium folders are ordinary documents emitted alongside the content as `_folder-*.json`
  (monsters by creature type, spells by level, items by category); `module.json` `packFolders`
  groups the four packs in the sidebar.

## Escape hatches for bad conversions

Rather than patching `src/`, add to the small curated tables:

- `spell_embed.ALIAS` — upstream spell-name typos/variants → canonical name.
- `build_spells.OVERRIDES` — spells whose mechanics `auto_detect()` can't infer (keyed by
  lowercase name).
- `build_spells.EFFECTS` — Active Effects for **duration** buffs, so the bonus lands on rolls by
  itself. `system.bonuses.{mwak,rwak,msak,rsak}.{attack,damage}` are real actor fields, and dnd5e's
  `FormulaField._applyChangeAdd` joins with an operator, so ADD mode stacks (`1d4 + 1d6`) instead of
  concatenating into nonsense. Use `transfer: false` on a spell — otherwise the bonus applies just
  for *knowing* the spell. Only duration buffs qualify: a "next time you hit" spell would keep
  applying until someone deleted the effect (dnd5e has no once-per-hit expiry), and a spell that
  buffs one specific weapon needs the enchantment system, not an actor-wide bonus.
- `build_spells.ALT_ACTIVITIES` — a second clickable activity for optional modes (Shadow Bolt's
  "spend 1 psychic for a d12"). The self-cost is chat flavour rather than `consumption`: dnd5e's
  consumption types don't verifiably cover paying hit points, and a malformed consumption block
  fails worse than a line of text.
- `build_spells.EXTRA_ACTIVITIES` — any number of further activities, of any kind, keyed by spell
  name then a short key that the activity id derives from (so adding one never disturbs the
  others). This is how a spell offers a conditional damage roll, a healing half, a summon or an
  ability check: **dnd5e shows one button per activity and shows them all at once — there is no
  "which version are you casting?" prompt** outside a summon activity's profile picker.
- **Do not split a spell into several documents.** It was tried for Deathwyrm's
  Fury, whose three breath weapons target differently, and it broke spell
  selection: a known-caster picks a fixed number of spells, so three list entries
  meant choosing one breath weapon permanently instead of the choice the spell
  grants. Variants belong in `EXTRA_ACTIVITIES` as named activities with their own
  `tpl` override, however different their areas are.
- `build_spells.NO_TEMPLATE` — spells whose only "N-foot radius" is a *light* radius. A template
  there puts a circle on the map that nothing is ever checked against, which reads as a bug.
- `build_spells.STATBLOCK_RE` — upstream lays sidebar statblocks inside a spell's column and
  `extract_spells.py` takes everything up to the next heading, so a creature lands in whichever
  spell it happens to follow. The Shambling Horde belongs to Army of the Dead but sat between
  Archangel and it, and Archangel absorbed the block *and* a "DC 15 Constitution saving throw"
  that `auto_detect` turned into a save activity on a self-buff. The builder logs what it strips.

An **Active Effect is inert unless an activity names it** — dnd5e renders the apply button from
`activity.effects`, not from the item's effect list. Dread Favor shipped for months with its
+1d4 unreachable for exactly this reason. `build_activity()` wires the link; don't add an
`EFFECTS` entry without it. Effect changes may name their own mode: `2` adds, `5` overrides, and
adding to an AC *calculation* is meaningless, so AC overrides need `5`.
- `build/data/extra_spells.json` — spells that appear in the WC5E spell *tables* but never get a
  definition block in Chapter 6, so `extract_spells.py` cannot produce them even though class
  features reference them (currently *Anti-Magic Shell* and *Feral Spirits*, transcribed by
  GoC45). Records use the same intermediate shape and go through `auto_detect()` like any other
  spell. If upstream ever defines one properly, the extracted version wins and the extra is
  skipped with a log line.
- `build_spells.DTYPE_ALIAS` — Warcraft flavour damage words (`frost`, `shadow`, `arcane`,
  `holy`, `nature`) → 5e damage types.
- `build_actors.TYPE_FOLDER`, `CONDITION_STEMS`, `SIZE_MAP` — creature-type/condition mapping.

`build_actors.py` prints a spellcasting report at the end (embedded count + unresolved spell
names by frequency) and `build_spells.py` prints the activity-kind histogram — use these to spot
regressions after a parser change.


# Cross-document references (the fragile part of the merged content)


The player-options documents contain **1,045 internal `Compendium.wc5e-foundryvtt.*` UUIDs** —
advancement `ItemGrant`/`ItemChoice` targets, `effects.origin`, `startingEquipment.key`, and
`@UUID[…]` links in description text — plus 387 references into the dnd5e system's own packs and
864 asset paths. These came from GoC45's module as `Compendium.wc5e-ccc.*` and were rewritten
during the merge.

**Consequences:** renaming a pack, changing the module id, or regenerating a document id breaks
advancement silently — a broken `ItemGrant` is a no-op on level-up, not an error. So pack names
(`class-features`, `new-equipment`, …) are load-bearing and must not be "tidied", and the spell
ids that class features point at are derived from spell *names* via `make_id("spell", name)` —
renaming a spell in the source breaks any feature granting it.

After touching any of this, re-run the integrity check: index every `_id` per pack, then confirm
every internal UUID resolves, no `wc5e-ccc` strings survive, and every `modules/wc5e-foundryvtt/…`
asset exists on disk.
