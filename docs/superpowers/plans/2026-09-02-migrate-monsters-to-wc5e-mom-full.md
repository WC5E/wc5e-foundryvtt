# Monster Source Migration Overview

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

## Recommended Migration Steps

1. Add a pure `loadMonstersFromFull()` adapter in a new module under `build/build-actors/`, returning `ParsedMonster[]` from `wc5e-mom-full.json`.
2. Add fixture-based unit tests for the five selected records. Assert the full normalized objects for basic fields, the hover/conditional-resistance behavior, subtype/AC provenance handling, named skill conversion, and rendered spellcasting features.
3. Modify `main.ts` to read only the consolidated source through the adapter. Keep `buildActor()` unchanged for the first migration iteration.
4. Run the existing actor build and compare generated actor JSON by deterministic name/ID against the current output. Classify every difference as intentional source correction, text-rendering change, or regression.
5. Run `npm test`, `npm run pack`, and `npm run verify`. The last two must run only after Foundry is closed because pack output is compiled and checked for freshness.
6. Once coverage and output review pass, delete the old-input and WIP-merge code paths. Do not delete the old reference files until the project deliberately decides whether they remain as migration fixtures.

## Acceptance Checks

- The adapter reports the number of `monster` records loaded and the number rejected for unsupported source shapes.
- Every selected sample reaches `buildActor()` with the expected flat fields and feature text.
- No previous actor ID changes, because IDs remain derived from `monster.name`.
- Spellcasting for `Ancient of Lore`, `Apparition`, and `Dark Iron Herald` remains discoverable by the existing spell-embedding path.
- Conditional defenses and malformed condition immunity entries are either faithfully represented or reported as explicit migration exceptions; neither may be silently dropped.
- `npm test` and `npm run verify` pass after the converted actors are packed.
