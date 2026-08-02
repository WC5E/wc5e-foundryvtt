# Spell content: lists, progression and subclass spells

How a WC5E caster ends up able to choose and cast anything. Four builders
cooperate here, and each fails silently when it is wrong -- which is why
they get their own document.

# Class spell lists


`build_spell_lists.py` produces `src/spell-lists/` — one dnd5e `spells`-type
JournalEntryPage per casting class. This is the *only* mechanism by which dnd5e knows which
spells a class may learn: `system.identifier` on the page must equal the class document's
`system.identifier` (`wc5e-mage`, …), and class features reference it as
`restriction.list: ["class:<identifier>"]`. Without these pages a custom class has no spell
list and spell selection silently does nothing.

**Registering them in the manifest is mandatory and easy to miss.** dnd5e discovers spell lists
*only* from `flags.dnd5e.spellLists` in `module.json` — `registerSpellLists()` returns immediately
unless that key is an array, and `SpellListRegistry.register()` resolves each entry with
`fromUuid()` and throws unless `page.type === "spells"`. The UUIDs must be **JournalEntryPage**
UUIDs (`Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.<jid>.JournalEntryPage.<pid>`).
Without the flag the pages sit inert: the compendium browser can't filter by class, and any
advancement restricted to `class:<identifier>` resolves to an empty pool — which is exactly how
v1.7.0/v1.8.0 shipped. `build_spell_lists.register_in_manifest()` writes the flag from the built
pages so the UUIDs cannot drift; never hand-edit it.

Source is `WIP 3.0 Chapters/Chapter 6 Spells.md` upstream, where each caster has a
`### <Class> Spells` section subdivided by `##### Nth Level`. Entry markup carries the
provenance that decides which pack to cite: `✦` = a WC5E custom spell (this module),
`^XGE^`/`^TCE^` = non-SRD official content (omitted, and named in the page description so the
gap is visible), bare = SRD. Blockquoted `> ##### Variant Rule:` blocks are optional
alternate lists and are skipped deliberately.

- `build/data/srd51_spell_ids.json` / `srd52_spell_ids.json` — committed name→id indexes for
  the dnd5e system's two SRD spell packs, so the build doesn't need a Foundry install to cite
  them. Regenerate by extracting `systems/dnd5e/packs/{spells,spells24}` if dnd5e reshuffles ids.
- `build_spell_lists.EXTRA_ENTRIES` — spells this module ships that the Chapter 6 tables never
  list (currently *Feral Spirits*, Heroes-Handbook-only). Without it they'd be unreachable:
  present in the compendium but on no class's list. The build asserts nothing silently: check
  that all of `src/spells` is cited by at least one list after changing spell names.
- Long names wrap in the source using `&nbsp;`/soft hyphens ("Amplify or &nbsp;&nbsp; Dampen
  Magic"); `clean_entry()` strips them, and forgetting that makes real spells look unavailable.

# Subclass spells


`build_subclass_spells.py` handles the Heroes Handbook subclass tables, which come in **two shapes
needing two different mechanisms** — telling them apart is the whole job:

- Keyed by **class level** (`| Paladin Level | Spells |`) — Oath / Path / Priesthood / Binding
  spells. Granted automatically and always prepared, like dnd5e's cleric domain spells, so they
  become `ItemGrant` advancements on the subclass with `spell.preparation: "always"`.
- Keyed by **spell level** (`| Spell Level | Spells |`) — the warlock "Expanded Spells". These widen
  what may be *chosen*, so they become spell-list pages with `system.type: "subclass"`
  (dnd5e's `spellListTypes` allows class/subclass/background/race/other).

Traps in the source: the paladin subclasses are "Oath of X" upstream but "Path of X" in the class
documents, and several names collide across classes (`Holy` the priesthood vs `Path of the Holy`
the oath; `Restoration` the binding vs `Path of Restoration` the druid path) — so `SECTIONS` maps
explicitly and validates against each subclass's `classIdentifier` instead of matching by name.
Column positions also vary: the paladin/priest tables are two columns, the druid ones insert an
`&nbsp;` spacer, so the spells column is found from the header. Split spell lists on **commas
only** — `enlarge/reduce` and `blindness/deafness` are single names containing a slash.

**Both spell-list builders write `flags.dnd5e.spellLists`,** so each preserves entries belonging to
the other journal. Without that, whichever ran second silently unregistered the first one's lists.
Verify by running them in both orders and checking the count holds.

## Why subclass caster progressions are deliberately absent

`Enhancement` (half/wis) and `Path of Feral` (half/wis) each have their own Cantrips/Spells Known
table upstream and are **intentionally not generated**. A subclass's `spellcasting` overrides the
class's for *slots*, but advancement has no subclass-conditional gating — `classRestriction` only
distinguishes primary/secondary multiclass. The Shaman class's spell-choice advancements fire
whatever subclass is taken, so adding Enhancement's table on top would double-grant rather
than replace. Don't "fix" this by adding them.

`Subtlety` is a different case: **the cloned repo is behind the class PDFs.** The repo still has an
older third-caster design referencing a "subtlety spell list" that was never written, while the
current Rogue PDF replaces it with *Subtle Magic* — a fixed set granted at rogue levels 3/7/11/15
(all SRD spells), cast from a bespoke pool of `INT mod + half rogue level` slots always at their
lowest level. The spell grants are transcribed in `build_subclass_spells.CURATED` and go through the
normal always-prepared path; delete that entry once upstream catches up. The slot pool is *not*
modelled — the subclass keeps `third` progression, which is an approximation, because dnd5e has no
way to express "flat pool, usable only for these spells, always at lowest level".

# Spell progression (the one generator that edits hand-maintained files)


`build_spell_progression.py` reads the Cantrips Known / Spells Known columns from the upstream
class tables and writes `ItemChoice` advancements into `src/classes/*.json`, so levelling up
actually prompts for spells. dnd5e has no built-in prompt — its own SRD casters expect you to add
spells from the spellbook by hand, and guided builders hardcode the progression per SRD class, so
custom classes get skipped. `ItemChoice` is the supported mechanism, so this is data-driven.

**It is the only generator that modifies hand-maintained documents**, so it is deliberately
surgical: ids come from `make_id("spellprog", class, kind, level)`, and every run removes that
entire candidate id set (all kinds × levels 1–20) before re-inserting. Hand-authored advancement is
never touched, and re-running cannot duplicate. Verify with an id-uniqueness assertion after
changing it.

**One advancement per (class, kind), with every level in its `choices` map** — not one per level.
That is what the field is for, and it is how dnd5e's own Magical Secrets is built. It shipped the
other way until v1.18.2, which cost two things: the player saw no record of earlier picks
(`context.sections` is built from `value.added` for earlier levels *of the same advancement*), and
"you can replace one of the spells you know" was dead, because `value.replaced` points at a level
inside the same advancement and there was never anything earlier to swap. The merged advancement
keeps the id of its **first** level so picks already recorded against it survive.

It does **not** stop the same spell being picked at two levels. dnd5e computes a
`previouslySelected` set in `ItemChoiceFlow` and never reads it — three references in the system,
all writes, never passed to the template — and `apply()` rejects nothing. Only a runtime hook could
prevent it; the decision was to leave it to the players.

**`pool` must stay empty.** It is tempting to fill it — `restriction.level` takes `""`,
`"available"` or one exact level, and `"available"` sets only a *maximum*, so a cantrip passes it and
can be "learned" as a spell. There is no "1 to max" option, and a pool is the only config that can
express "these, not cantrips". v1.18.2 shipped exactly that and it had to come straight back out.

A pool is a **build-time snapshot**. `restriction.list` is resolved **live**, through
`dnd5e.registry.spellLists.forType()` against the class's spell-list page — the same page the
auto-assign tool fills with the GM's own copies of the non-SRD spells we cannot ship. A pool cannot
see any of that. The Shaman's level 1 choice collapsed from "every 1st-level spell on the list you
actually own" to the nine that happen to resolve at build time. The whole point of the auto-assign
feature is that the GM brings content we can't; anything that bypasses the live list defeats it.

So cantrips do appear in a Spells Known choice, and a Death Knight — whose cantrips come from
Profane Warrior rather than this advancement — can re-pick them. That is accepted, alongside dnd5e
letting you take the same spell at two levels. Both are player discipline, not data problems.

Table sources, best first: `WIP 3.0 Classes/<Class>` (extensionless for some classes) then the
Heroes Handbook section. A candidate that yields no column must **fall through**, not end the
search — `Warlock.md` carries the prose but contains no markdown tables at all, so the Warlock
table only comes from the Heroes Handbook.

`SPELLBOOK` covers casters whose learning rule is in **prose, not a table column**: the Mage is a
spellbook caster ("a spellbook containing six 1st-level mage spells", "each time you gain a mage
level, you add two"), so it gets 6 at level 1 and 2 at every level after. Priest and Druid
deliberately get nothing beyond cantrips — they prepare from the *entire* class list, so there is no
learning step to prompt for. Only `kind == "spell"` (known casters) sets `replacement: true`;
cantrips are fixed and a spellbook is only added to.

Known-good output: Death Knight 10 spell picks (L2,3,5,7,9,11,13,15,17,19); Druid/Mage/Priest 3
cantrip picks; Shaman 3 cantrip + 16 spell; Warlock 3 cantrip + 14 spell. **Paladin generates
nothing on purpose** — it has no Known column in either source, being a prepared half-caster whose
only cantrips come from the Blessed Fighter fighting style. Cantrip choices use
`restriction.level: "0"`; spell choices use `"available"` (any level the character has slots for),
and only spells get `replacement: true`.

# Advancement levels on non-class items


`AdvancementManager.forNewItem` creates flows for **every level from 0 to the current level** for
anything that isn't a class — so an `ItemChoice` on a feature, race or background should key its
`configuration.choices` at **`"1"`**, which then fires no matter what class level the item was
granted at. Keying it at the class level (e.g. `"2"` for a level-2 fighting style) works only for a
character who took it at exactly that level. `ItemChoiceAdvancement.configuredForLevel` treats any
level absent from `choices` as already satisfied, so a wrong key fails **silently** — no error, no
prompt. The races use `"1"`; match them.

Features that grant spells from *another* class's list (the `Profane Warrior` and `Blessed Fighter`
fighting styles) need an explicit `ItemChoice` with
`restriction: {type: "spell", level: "0", list: ["class:wc5e-warlock"]}`, because the sheet would
otherwise only offer the character's own class list. The main `Spellcasting` features do **not**
need one — dnd5e's own SRD casters have no cantrip `ItemChoice` either; players add cantrips from
the spellbook browser, which works once the lists are registered.

# Backgrounds


`build_backgrounds.py` reads `## New Backgrounds` from `Heroes Handbook, Main File.txt` (chapter 3)
and emits, per background, a `background` item plus a separate `feat` for its feature, into
`src/backgrounds/`. Only 4 exist upstream.

A dnd5e background drives the sheet entirely through `system.advancement`: a `Trait` with
`grants: ["skills:dec", …]` for fixed proficiencies, a `Trait` with
`choices: [{count: n, pool: ["languages:*"]}]` for "one of your choice", and an `ItemGrant` titled
`Feature` pointing at the feature item. Trait keys verified against dnd5e 5.3.3: `skills:<abbr>`,
`languages:*`, flat kit ids like `tool:forg`, and namespaced `tool:art:*` / `tool:music:*`.

- `startingEquipment` is intentionally left `[]`. dnd5e wants typed AND/OR groups referencing item
  UUIDs, and a malformed one breaks the background sheet, so the equipment line stays verbatim in
  the description. Wiring it properly is a possible follow-up.
- `DEHYPHEN` fixes hyphenation baked into the source prose (`organi-zation`). It's mid-sentence,
  not at line ends, so joining lines can't undo it, and blanket de-hyphenation would destroy real
  compounds like *self-mastery*. Anything hyphenated that isn't in `DEHYPHEN` or
  `LEGITIMATE_HYPHENS` is reported at the end of the build rather than shipped silently.
