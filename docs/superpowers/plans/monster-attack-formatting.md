# Monster macro conversion and attack formatting plan

**Date:** 2026-09-04 **Status:** `@atk`, `@damage`, `@h`, and `@status` implemented; activity compatibility added;
remaining mappings and full structured activity wiring are pending

## Problem

The WC5E monster source is adapted from 5etools-style JSON and contains `{@...}` macros throughout traits, actions,
spellcasting text, and journal-like entries. The current converter renders only a small subset in
`build/convert-monster-json/source/render.ts`. Unknown tags fall back to their body text, which keeps some prose
readable but silently loses links, formatting, and tag-specific meaning.

Monster attacks are one visible example:

```text
{@atk mw} {@hit 6} to hit, reach 5 ft., one creature. {@h}7 ({@damage 1d8 + 3}) piercing damage
```

The first implementation is a small, tested macro-conversion library. Attack parsing currently retains its plain-text
fallback and can consume the rendered Foundry damage form; the complete structured activity handoff remains future work.

## Non-goals

- No implementation in this pass.
- No edits to generated monster JSON.
- No attempt to reproduce every external 5etools renderer.
- No loss of original rules text. Unsupported or ambiguous macros must remain visible in a deterministic fallback form.
- No commitment yet to rewriting all attack descriptions around Foundry-generated text.

## Complete source macro inventory

A read-only scan of `reference/parsed/wc5e-mom-full.json` found these 21 distinct tags. Counts are source occurrences
and indicate priority, not a future-data contract.

| Tag                | Count | Status         | Representative form                                 | Initial conversion intent                                                         |
| ------------------ | ----: | -------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `{@action ...}`    |     1 | Pending        | `{@action Dodge}`                                   | Render the action name; link it only if a local reference exists.                 |
| `{@atk ...}`       |   469 | Implemented ✅ | `{@atk mw}`, `{@atk mw,rw}`                         | Convert attack abbreviations to structured attack metadata and readable labels.   |
| `{@b ...}`         |    43 | Implemented ✅ | `{@b lion}`                                         | Render bold formatting using the existing markdown conversion.                    |
| `{@book ...}`      |     1 | Pending        | `{@book Dungeon Master's Guide\|DMG\|8\|Going Mad}` | Preserve the display name; resolve only supported local references.               |
| `{@condition ...}` |   517 | Pending        | `{@condition prone}`                                | Render the condition and link to the system condition where possible.             |
| `{@creature ...}`  |   325 | Pending        | `{@creature Ape\|WC5E MoM}`                         | Link to a converted monster when present; otherwise preserve its name.            |
| `{@damage ...}`    |   859 | Implemented ✅ | `{@damage 2d6 + 6}`                                 | Render a typed Foundry damage roll; parse the dice count, not the static average. |
| `{@dc ...}`        |   434 | Confirmed      | `{@dc 14}`                                          | Render a DC and expose it to save parsing.                                        |
| `{@dice ...}`      |   108 | Pending        | `{@dice 1d4}`                                       | Render a generic dice formula without assuming damage.                            |
| `{@disease ...}`   |    19 | Pending        | `{@disease radiation sickness\|WC5E MoM}`           | Preserve the disease name; link only when locally supported.                      |
| `{@h}`             |   490 | Implemented ✅ | `{@h}`                                              | Render an emphasized `Hit:` label and provide a hit boundary to parsing.          |
| `{@hit ...}`       |   521 | Implemented ✅ | `{@hit 3}`                                          | Expose a signed bonus and render it as `+3` or `-3`.                              |
| `{@i ...}`         |    72 | Implemented ✅ | `{@i lightning breath}`                             | Render italic formatting using the existing markdown conversion.                  |
| `{@item ...}`      |    39 | Pending        | `{@item shield\|PHB}`                               | Link to a supported item or preserve its display name.                            |
| `{@note ...}`      |    36 | Pending        | `{@note List of Murlocs}`                           | Render the note label/content without dropping it.                                |
| `{@recharge ...}`  |    88 | Pending        | `{@recharge 5}`                                     | Render recharge text and expose metadata where the activity model supports it.    |
| `{@reward ...}`    |     1 | Pending        | `{@reward worgen curse}`                            | Preserve readable reward text; do not invent a document link.                     |
| `{@skill ...}`     |    80 | Pending        | `{@skill Perception}`                               | Render the skill and use a system identifier where possible.                      |
| `{@spell ...}`     |   680 | Pending        | `{@spell fire bolt}`, `{@spell gust\|xge}`          | Link to a converted spell or preserve the name when it is not bundled.            |
| `{@status ...}`    |    18 | Implemented ✅ | `{@status concentration}`                           | Convert the status to a `&Reference[condition=...]` reference.                    |
| `{@table ...}`     |     1 | Pending        | `{@table indefinite madness\|DMG}`                  | Preserve the table name; resolve only supported local tables.                     |

- `Implemented ✅` means the behavior has been added to the converter and covered by tests.
- `Confirmed` means the desired conversion behavior has been specified in this plan but is not implemented.
- `Pending` means the tag is not implemented and its behavior remains subject to the initial conversion intent above.

The current implementation covers balanced nested parsing, `@atk`, `@hit`, `@h`, `@damage`, `@status`, and the existing
`@i`/`@b` formatting behavior. `@damage` lookahead consumes a recognized damage type and the display-only `damage` word.
The activity parser accepts both legacy source damage (`17 (2d10 + 6) piercing damage`) and rendered Foundry damage
(`17 ([[/damage 2d10 + 6 piercing]])`). In both cases, `DamagePart.number` is the dice count (`2`); the leading average
(`17`) is not part of the activity damage model.

Macros nest, for example `{@i {@spell fire bolt}}`, and use pipe-delimited arguments. The parser must not assume that
the first closing brace terminates an outer macro or that every pipe argument is a document identifier.

## Proposed macro library

Create one conversion boundary in the source renderer, centered on a tag registry rather than a growing `switch`. Each
registered tag should provide enough information for callers to choose output:

```ts
type MacroResult = {
	text: string;
	kind?: "attack" | "hit" | "damage" | "dc" | "link" | "formatting" | "plain";
	data?: Record<string, unknown>;
};
```

The exact type can follow local conventions, but the design should separate:

- balanced nested-brace parsing and pipe-argument splitting;
- tag-specific conversion and structured metadata;
- Foundry-compatible rendering for descriptions;
- deterministic fallback for unknown tags, malformed arguments, and unavailable references.

The library should support two modes:

- **Rendered prose mode:** preserve complete text for item descriptions.
- **Structured extraction mode:** let attack, save, and damage parsing consume macro metadata without reparsing rendered
  punctuation.

Every inventory tag needs at least a loss-minimizing fallback in the first version. Local spells, monsters, and
supported items are higher priority than external books, diseases, tables, or rewards. Unknown tags should be reported
in tests or a conversion report instead of silently disappearing.

## Confirmed mappings

The first incremental implementation will establish these mappings before expanding the rest of the registry:

### `{@atk ...}`

Render the existing full attack name inside emphasis tags. The readable label is unchanged; only the output wrapper
changes:

| Source         | Output                                    |
| -------------- | ----------------------------------------- |
| `{@atk mw}`    | `<em>Melee Weapon Attack:</em>`           |
| `{@atk rw}`    | `<em>Ranged Weapon Attack:</em>`          |
| `{@atk mw,rw}` | `<em>Melee or Ranged Weapon Attack:</em>` |
| `{@atk ms}`    | `<em>Melee Spell Attack:</em>`            |
| `{@atk rs}`    | `<em>Ranged Spell Attack:</em>`           |

The structured attack metadata should still be retained independently of the HTML rendering, so activity extraction does
not need to parse the emphasized label.

### `{@damage ...}`

Convert a damage macro into Foundry's `[[/damage ...]]` macro and include the damage type in the same roll expression.
The converter must look ahead in the surrounding text for the immediate damage-type phrase, because the source stores
the type after the closing macro:

```text
{@h}3 ({@damage 1d4 + 1}) piercing damage
```

becomes:

```text
<em>Hit:</em> [[/damage 1d4 + 1 piercing]]
```

The damage amount and modifiers remain unchanged. The consumed source suffix is the damage type and its display-only
`damage` word; the output should not duplicate the word `damage` outside the roll. This is a token-level transformation,
not an independent regex replacement, so it can distinguish a typed damage macro from an untyped `{@dice ...}` macro and
leave ambiguous or conditional follow-up text intact.

The initial tests should cover at least `piercing`, `slashing`, `bludgeoning`, `cold`, `fire`, and `poison`, plus extra
damage and alternative damage sentences.

### `{@dc ...}`

When a DC macro is immediately followed by an ability and `saving throw`, convert the complete phrase into Foundry's
save macro. Normalize the ability name to the lowercase Foundry identifier and keep the numeric DC unchanged:

```text
{@dc 13} Constitution saving throw
```

becomes:

```text
[[/save constitution 13 format=long]]
```

As with typed damage, this is a context-aware transformation. The converter should consume the source ability and the
display-only words `saving throw` only when the phrase matches a known ability. A standalone `{@dc 13}` such as
`spell save {@dc 13}` must remain a readable DC value until a more specific surrounding macro rule is defined; it must
not invent an ability or emit an invalid save command.

The initial tests should cover all six abilities (`strength`, `dexterity`, `constitution`, `intelligence`, `wisdom`, and
`charisma`), capitalization variants, and a standalone DC without an ability context.

### `{@status ...}`

Convert the status name into the system reference syntax, using the macro body as the `condition` value:

```text
{@status concentration}
```

becomes:

```text
&Reference[condition=concentration]
```

The value should be normalized only as required by the reference system. Do not replace the status with a generic
display string or create a link to a document that does not exist. The initial test should cover `concentration` and
confirm that the body is passed through as the condition identifier.

## Attack-specific contract

The current activity parser is `build/convert-monster-json/actor/activities.ts`. It extracts attack kind, bonus, range,
and damage from rendered text, and defaults every target to one creature. Macro metadata should make these values
explicit:

| Source macro                             | Structured value       | Rendered value                            |
| ---------------------------------------- | ---------------------- | ----------------------------------------- |
| `{@atk mw}`                              | melee weapon           | `<em>Melee Weapon Attack:</em>`           |
| `{@atk rw}`                              | ranged weapon          | `<em>Ranged Weapon Attack:</em>`          |
| `{@atk mw,rw}`                           | melee or ranged weapon | `<em>Melee or Ranged Weapon Attack:</em>` |
| `{@atk ms}` / `{@atk rs}`                | melee/ranged spell     | corresponding emphasized header           |
| `{@hit 3}`                               | bonus `3`              | `+3`                                      |
| `{@h}`                                   | hit boundary           | `<em>Hit:</em>`                           |
| `{@damage 1d8 + 3}` + `fire damage`      | typed damage formula   | `[[/damage 1d8 + 3 fire]]`                |
| `{@dc 13}` + `Constitution saving throw` | save DC and ability    | `[[/save constitution 13 format=long]]`   |

Plain-text parsing remains a fallback because source actions are not perfectly consistent.

### Hit boundaries and riders

After macro conversion, classify the hit portion without discarding the original description:

| Category                     | Example                                    | Initial handling                                                               |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `none`                       | base damage ends the description           | Model the base damage in the activity.                                         |
| `same-sentence-extra-damage` | `... slashing damage plus ... cold damage` | Add extra typed damage only when formula and type are unambiguous.             |
| `comma-effect`               | `... damage, and the target ...`           | Keep the effect as authored rider prose.                                       |
| `sentence-effect`            | `... damage. If the target ...`            | Keep the effect as authored rider prose.                                       |
| `alternative`                | `... damage, or ... damage if ...`         | Keep the alternative in prose unless a separate activity is clearly justified. |
| `special-hit`                | `Hit: The target must ...`                 | Do not fabricate base damage; use a save/utility activity if parseable.        |

The conservative first release should retain the full rendered source description as visible rules text. Foundry
activity output supplements it.

## Malformed and unsupported source patterns

Keep these separate from legitimate macro conversion:

- `Melee Attack Weapon:`, a period in place of the attack-header colon, and duplicated headers.
- Unresolved placeholders such as `+X to hit`.
- `Hit:The`, `Hit:, 4 (...)`, or damage types missing the word `damage`.
- Range/target text outside the standard attack sentence shape.
- Unknown tags, missing bodies, unbalanced braces, and invalid pipe arguments.

Normalization may be applied to parser input only. It must not rewrite visible descriptions unless explicitly approved.
Every normalization should be logged or represented in a conversion result so malformed source cannot silently become a
misleading activity.

## Decisions

### Macro output contract

Recommended: use a structured result internally while retaining a simple rendered-text API for existing callers. This
keeps the builder stable and gives activity parsers a typed path for attack, hit, damage, and save data.

### Link resolution

Recommended priority:

1. Resolve documents bundled in this module, especially spells, creatures, and supported items.
2. Resolve dnd5e/system references when a local mapping exists.
3. Render external or unsupported references as readable text with no broken link.

Never manufacture a module link for a document that is not present.

### Visible text versus activity text

Recommended: preserve full rendered source text in descriptions and improve activities independently. This protects
unusual riders, alternatives, and special `Hit:` text.

### Target semantics

Do not solve all target semantics in this work. Restrictions such as `one prone creature`, `all targets in reach`, and
`one Medium or smaller creature` should remain visible prose unless the system model can represent them without lying
about the action.

## Suggested implementation phases

### Phase 1: fixtures and tests

**Implemented for the current slice:**

- Focused fixtures cover nested tags, status references, structured attack and damage metadata, and both legacy and
  rendered damage formats.
- Completed for `{@status ...}`: assert `{@status concentration}` becomes `&Reference[condition=concentration]`,
  including surrounding prose and multiple status tags.
- The regression fixture `17 (2d10 + 6) piercing damage` confirms that the static average is not parsed as the dice
  count.

**Still pending:**

- Add focused fixtures for all 21 tags, representative actions from `Murloc Tidehunter`, and all malformed cases in the
  scan.
- Assert deterministic fallback and warning/reporting behavior for every unsupported or malformed macro.

### Phase 2: balanced parser and registry

**Partially implemented:**

- Replaced repeated regex-only nested handling with a balanced-brace parser and depth-aware pipe splitting.
- Added conversion for `@atk`, `@hit`, `@h`, and `@damage`, while retaining the existing `@status`, `@i`, and `@b`
  conversions.

**Still pending:**

- Add the complete registry above and keep conversion pure and deterministic.
- Make warnings/reporting available without making ordinary conversion noisy.

### Phase 3: wire activity extraction to metadata

**Partially implemented:**

- Structured renderer results now expose `atk`, `hit`, `h`, and `damage` metadata, and damage parsing accepts the
  rendered Foundry roll syntax.
- The damage parser explicitly separates a displayed average from the dice count.

**Still pending:**

- Use structured `atk`, `hit`, `h`, and `damage` results directly in activity construction rather than relying on
  rendered-text fallback parsing.
- Convert a `dc` result plus a recognized ability/save-phrase suffix into `[[/save <ability> <dc> format=long]]`; retain
  standalone DCs as text.
- Retain plain-text parsing as a fallback.
- Add explicit handling for extra damage, riders, alternatives, and special-hit text.
- Confirm malformed headers do not accidentally become standard attacks.

### Phase 4: optional link and description improvements

- Resolve local spells, creatures, and items to valid Foundry references.
- Decide how external references render.
- Only then consider rewriting visible attack descriptions, with a test that every original rider remains visible.

## Verification

Run the normal checks after implementation:

```bash
npm test
npm run verify
```

Focused tests should cover all 21 tags; `{@status concentration}` becoming `&Reference[condition=concentration]`; nested
`{@i {@spell ...}}`; pipe arguments and display overrides; signed hit bonuses; typed `{@damage ...}` output; all six
ability forms for `{@dc ...}`; standalone DCs remaining readable; generic `{@dice ...}` versus `{@damage ...}`; unknown
and unbalanced macros; non-SRD spell names remaining unbundled; alternatives not becoming unconditional extra damage;
special-hit text not producing fake damage; and malformed attack headers being intentionally accepted or rejected.

The final check should rebuild generated content where appropriate and confirm source descriptions remain intact. Do not
commit pack output written by a running Foundry instance.

## Open questions

- What exact Foundry HTML/link form should each resolved document use?
- Should the registry return a discriminated union instead of the generic `MacroResult` sketch?
- Should `action`, `skill`, `status`, and `condition` resolve to system references in the first release?
- Should external `book`, `disease`, `reward`, and `table` references ever become links?
- Should unknown macros fail verification or warn while preserving their text?
