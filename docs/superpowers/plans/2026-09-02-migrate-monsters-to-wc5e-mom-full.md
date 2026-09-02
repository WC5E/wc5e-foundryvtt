# Monster Source Migration Plan

## Goal

Replace the `reference/parsed/monsters.json` plus `reference/parsed/monsters_wip.json` inputs consumed by `build/build-actors/main.ts` with the `monster` array in `reference/parsed/wc5e-mom-full.json`.

This is a source-ingestion migration, not a change to the Foundry actor schema. The safest implementation is an adapter from the consolidated file's 5etools-style monster records to the existing `ParsedMonster` contract in `build/build-actors/types.ts`. `buildActor()` and its stable name-derived IDs can therefore remain unchanged.

## Samples Compared

The following five entries exist in both `monsters.json` and `wc5e-mom-full.json` and cover the relevant source shapes:

| Entry | Shape exercised | Findings |
| --- | --- | --- |
| Ancient Protector | Basic non-caster; AC provenance; simple damage lists | `H` maps to `huge`; AC is `{ ac: 15, from: ["natural armor"] }`; resistance and vulnerability are arrays; traits and actions use `entries`. |
| Ancient of Lore | Prepared caster; saving throw and named skills; variant | Ability scores are top-level; `save.wis` and `skill.history`/`skill.nature` carry signed-string totals; its spellcasting block is separate from `trait`; `variant` has no destination in the old contract. |
| Ancient of War | Condition immunities; ordinary feature/action lists | `conditionImmune` is an array; normalized `trait` and `action` content corresponds directly to old `traits` and `actions`. |
| Apparition | Hover flight; conditional defense; split language phrase | Flight is `{ number: 40, condition: "(hover)" }` plus `canHover: true`; one resistance is an object with `resist`, `note`, and `cond`; languages arrive as two strings that must become one human-readable field. |
| Dark Iron Herald | Humanoid subtype; item-derived AC; innate and prepared casting | `type` is `{ type: "humanoid", tags: ["dwarf"] }`; AC provenance is an item tag; separate `spellcasting` records replace legacy synthetic traits; skill names need translation to the old three-letter keys. |

All five preserve the same core name, hit points, ability scores, CR, and ordinary feature/action meaning. The consolidated source has more structured data and uses 5etools inline tags such as `{@damage ...}` and `{@spell ...}`; it is not a drop-in `ParsedMonster` array.

## Field Mapping

| Existing `ParsedMonster` field | Consolidated source | Adapter rule |
| --- | --- | --- |
| `name` | `name` | Direct copy. Continue using name as the deterministic actor-ID input. |
| `size` | `size[0]` | Convert 5etools codes: `T/S/M/L/H/G` to `tiny/small/medium/large/huge/gargantuan`. |
| `type`, `subtype` | `type` | If string, use it as `type` and set subtype to `""`. If object, use `.type` and join `.tags` with `", "` for `subtype`. Preserve other object fields only if later required. |
| `alignment` | `alignment` | Decode 5etools alignment codes (`L`, `N`, `C`, `G`, `E`, `U`, `A`) into the legacy lowercase text used by `details.alignment`. Do not concatenate blindly: `N` can mean neutral or unaligned depending on record context. |
| `ac`, `ac_note` | `ac[0]` | Number yields `ac` and an empty note. Object yields `.ac`; turn `.from` into readable source text after stripping 5etools item tags. `ac_note` is currently not used by `buildActor`, but retain it for parity. |
| `hp`, `hp_formula` | `hp.average`, `hp.formula` | Direct copy. Define a fallback for any record that omits `average` or `formula` before migration. |
| `speed` | `speed` | Emit all six legacy keys (`walk`, `fly`, `swim`, `climb`, `burrow`, `hover`), defaulting numeric movements to `0`. Accept both numeric movement and `{ number, condition }`; set hover from `canHover` or a movement condition mentioning hover. |
| `abilities` | top-level `str`, `dex`, `con`, `int`, `wis`, `cha` | Gather into the legacy object. Default only after reporting malformed/missing scores. |
| `saves` | `save` | Convert signed strings such as `"+8"` to numbers. Keys already use ability abbreviations. |
| `skills` | `skill` | Convert signed strings to numbers and translate full 5etools skill names to Foundry/dnd5e abbreviations (`history -> his`, `insight -> ins`, `intimidation -> itm`, and so on). |
| `damage_vulnerabilities` | `vulnerable` | Flatten the 5etools list to the comma-delimited legacy text. Preserve any notes/conditions in a form that `mapDamage()` can safely consume or report unsupported structured cases. |
| `damage_resistances` | `resist` | Flatten simple strings. For objects such as Apparition's nonmagical B/P/S resistance, reconstruct the old semicolon-plus-note form, or extend the actor mapping deliberately so the condition is not silently lost. |
| `damage_immunities` | `immune` | Same flattening policy as resistances. |
| `condition_immunities` | `conditionImmune` | Join simple entries with `", "`. Validate entries, because the source sample includes the malformed combined value `"frightened grappled"`; a migration must not hide this data-quality problem. |
| `senses` | `senses`, `passive` | Parse the textual ranges into `darkvision`, `blindsight`, `tremorsense`, and `truesight`; set absent ranges to `0`; copy `passive`; put unparsed text in `special`. Existing `senseTags` are metadata, not a source for ranges. |
| `languages` | `languages` | Join phrases with `", "` to retain the display text. Do not substitute `languageTags`; they are taxonomy metadata and lose prose such as "but can't speak". |
| `cr` | `cr` | Convert numeric strings to numbers. Handle object-form CR records explicitly before enabling the migration. |
| `traits` | `trait` plus `spellcasting` | Convert ordinary `trait` entries. Also render every `spellcasting` object into a `MonsterFeature`, because current spell embedding scans the textual `Spellcasting`/`Innate Spellcasting` traits. |
| `actions` | `action` | Convert each entry to `{ name, text }`. |
| `reactions` | `reaction` | Convert each entry; default to `[]`. |
| `legendary` | `legendary` | Convert each entry; default to `[]`. Preserve any nameless legendary-action preamble because `buildActor()` reads it to set the legendary action count. |
| `_wip` / `source_file` | `source`, `page` | The consolidated file has no equivalent WIP split. Remove WIP merge logic only after a coverage comparison confirms its `monster` array is authoritative. `source_file` is not consumed by `buildActor`; retain source provenance separately only if needed for diagnostics. |

## Text And Entry Conversion

The old parser emitted a single Markdown-ish `text` string. The new data uses `entries` arrays, which can contain strings and nested objects. The adapter needs a recursive renderer that:

1. joins string entries into readable text while retaining paragraph boundaries;
2. renders named nested entries as their own labeled paragraphs;
3. renders `list` entries as lists rather than JSON text;
4. converts the 5etools inline tags needed by the existing activity and spell parsers:
   `{@atk ...}`, `{@hit ...}`, `{@damage ...}`, `{@dice ...}`, `{@dc ...}`, `{@spell ...}`, `{@condition ...}`, `{@skill ...}`, and emphasis tags;
5. keeps the result compatible with `spell-embed.ts`, which currently parses the old synthetic spellcasting trait text.

Do not discard source-only collections such as `variant`, `attachedItems`, or tags merely because the current actor builder ignores them. Initially log their presence and counts. They represent potential behavior or provenance that the old pipeline may have omitted.

## Implementation Plan

### 1. Define the new source boundary

- [ ] Add a 5etools-source interface beside `ParsedMonster` in `build/build-actors/types.ts`, covering the fields consumed by this migration rather than attempting to type the entire consolidated file.
- [ ] Add a pure adapter module, for example `build/build-actors/source.ts`. Its public boundary should accept a parsed `wc5e-mom-full.json` root and return the converted `ParsedMonster[]` from `root.monster`.
- [ ] Keep file I/O in `main.ts`; this makes all field mapping and text rendering independently testable.
- [ ] The adapter must reject a missing or non-array `root.monster` with a useful error, rather than generating an empty pack.

### 2. Implement scalar and collection mappings

- [ ] Implement the field conversions in the table above: compact size/alignment codes, string-or-object creature type, AC, hit points, movement, abilities, saves, skills, defenses, senses, languages, and CR.
- [ ] Build the full 5etools skill-name to dnd5e abbreviation map from `SKILL_ABILITY` in `mappings.ts`; do not add a partial map just for the five examples.
- [ ] Ensure omitted optional fields produce the existing empty defaults: no damage or condition immunity, no senses, no languages, and empty trait/action/reaction/legendary arrays.
- [ ] Treat unsupported structured forms, malformed numeric strings, and unknown codes as explicit conversion errors naming the monster and field. Do not silently substitute a default AC, CR, or ability score.
- [ ] Preserve the source's printed `hp.average` and numeric `cr`; do not derive either value from a formula or XP.

### 3. Preserve feature and spellcasting behavior

- [ ] Add a recursive 5etools-entry renderer for ordinary `trait`, `action`, `reaction`, and `legendary` entries. It must produce the `MonsterFeature.text` string expected by `activities.ts` and `actor.ts`.
- [ ] Convert the inline markup that affects existing parser behavior: attack kind, attack bonus, hit marker, dice/damage, save DC, spell names, conditions, skills, and emphasis. Retain readable text for unhandled tags rather than removing content.
- [ ] Render each structured `spellcasting` block into a synthetic feature alongside ordinary traits. Its name must include `Spellcasting` so the existing `embedSpellcasting()` lookup finds it.
- [ ] Preserve the spellcasting header, level/slot groups, at-will spells, daily spells, footer text, spellcasting ability, and save DC in the synthetic text. The immediate compatibility target is the grammar parsed by `parseSpellcasting()` in `spell-embed.ts`.
- [ ] Ensure a monster with both innate and ordinary spellcasting retains both records. The current embedding function selects only the first feature whose name includes `spellcasting`; extend that function to process every matching feature before changing the input in `main.ts`.
- [ ] Continue to collect unmatched spells for `missing-spells.json`; this is a hard behavioral contract of the actor build.

### 4. Switch the actor entry point

- [ ] In `build/build-actors/main.ts`, replace reads of `monsters.json` and `monsters_wip.json` with a single read of `wc5e-mom-full.json` passed to the adapter.
- [ ] Remove `existsSync` and the WIP merge loop. The consolidated source is the sole input and should not annotate records with `_wip`.
- [ ] Leave `buildActor()`, folder assignment, slug collision handling, deterministic IDs, and output-directory cleanup untouched in this step.
- [ ] Update the output log to report the consolidated-source count rather than main/WIP counts.

### 5. Add focused regression tests

- [ ] Add Vitest coverage for the pure adapter and entry renderer. Use small in-test fixtures based on the five compared examples, not the full 45,000-line source file.
- [ ] Verify scalar conversion with `Ancient Protector` and `Ancient of War`, including AC source text, vulnerabilities/resistances, and condition immunities.
- [ ] Verify typed subtype, named save/skill conversion, and separately represented innate/prepared casting with `Dark Iron Herald`.
- [ ] Verify hover movement, conditional nonmagical B/P/S resistance, split language prose, and spellcasting conversion with `Apparition`.
- [ ] Verify nested entries, prepared slots, and variant detection/reporting with `Ancient of Lore`.
- [ ] Add a failure assertion for an invalid source root or malformed required field so accidental schema drift fails loudly.

### 6. Compare output and complete verification

- [ ] Before switching the input, retain a committed or copied baseline of the generated actor JSON outside the builder-owned `src/generated/monsters` directory.
- [ ] Run `npm run actors` and compare actors by deterministic `_id`, classifying every difference as an intentional source correction, rendering difference, or regression. The number of actors, embedded spells, and unresolved-spell manifest records are the primary discriminators.
- [ ] Run `npm test` after the focused adapter tests pass.
- [ ] With Foundry closed, run `npm run pack` followed by `npm run verify`. Do not run `build/_chk.mjs` during this sequence because it mutates pack manifests.
- [ ] Do not delete `reference/parsed/monsters.json` or `reference/parsed/monsters_wip.json` in this migration. They remain useful fixtures and a comparison baseline until a later cleanup decision.

## Acceptance Checks

- The adapter reports the number of `monster` records loaded and fails on unsupported required source shapes.
- Every selected sample reaches `buildActor()` with the expected flat fields and feature text.
- No previous actor ID changes, because IDs remain derived from `monster.name`.
- Spellcasting for `Ancient of Lore`, `Apparition`, and `Dark Iron Herald` remains discoverable, and a monster with multiple spellcasting blocks embeds from each block.
- Conditional defenses and malformed condition immunity entries are either faithfully represented or reported as explicit migration exceptions; neither may be silently dropped.
- `npm test` and `npm run verify` pass after the converted actors are packed.
