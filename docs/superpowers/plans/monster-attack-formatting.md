# Monster attack formatting plan

**Date:** 2026-09-04
**Status:** research captured, not approved, not implemented

## Problem

Foundry's dnd5e system can generate the standard attack description line from activity data, but the WC5E monster source currently stores the full printed attack text in each item description. A typical source line is:

```text
Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage
```

The hard part is that the printed text is not just one shape. Some attacks end immediately after the base damage. Some continue with extra damage in the same sentence. Some add a comma-led rider, while others start a new sentence after the damage. There are also malformed source lines that look close to the standard format but should not be treated as meaningful formatting variants.

The goal of this plan is to separate those cases before changing the converter, so a later implementation can decide what Foundry should generate and what prose should remain authored text.

## Non-goals

- No implementation in this pass.
- No edits to generated monster JSON.
- No attempt to fix every typo found during sampling.
- No loss of original printed rules text. Even if activities become more structured, descriptions must preserve any text Foundry cannot model cleanly.

## Current behavior

Generated monster actions are emitted as feat items. The item description carries the full statblock text, and the builder creates an activity when it can parse an attack, save, or utility action.

The current attack parser lives in `build/convert-monster-json/actor/activities.ts`. It recognizes attack headers shaped like:

```text
Melee Weapon Attack:
Ranged Weapon Attack:
Melee or Ranged Weapon Attack:
Melee Spell Attack:
Ranged Spell Attack:
```

It extracts:

- attack type: melee or ranged
- classification: weapon or spell
- flat to-hit bonus
- reach or range
- damage parts from dice expressions followed by a mapped damage type

It does not currently use the printed target text. Attack activities always get `target.affects = { count: "1", type: "creature" }`, even when the source says `one target`, `one prone creature`, `all targets in reach`, or `up to three targets`.

## Scan summary

A read-only scan of `src/generated/monsters` found 491 monster item descriptions with an attack header plus `Hit:`.

### Header shapes

| Count | Header shape |
|---:|---|
| 420 | `Melee Weapon Attack:` |
| 46 | `Ranged Weapon Attack:` |
| 12 | `Melee or Ranged Weapon Attack:` |
| 8 | `Melee Attack Weapon:` |
| 3 | `Melee Spell Attack:` |
| 2 | `Ranged Spell Attack:` |

`Melee Attack Weapon:` is a malformed variant in the source, not a distinct rules format.

### Target and range shapes

Common shapes:

| Count | Shape |
|---:|---|
| 345 | `reach N ft., one target` |
| 40 | `reach N ft., one creature` |
| 33 | `range N/N ft., one target` |
| 11 | `reach N ft. or range N/N ft., one target` |
| 8 | `range N ft., one target` |
| 7 | `reach N ft., one Medium or smaller creature` |
| 7 | `reach N ft., one prone creature` |

Less common but important shapes:

- `reach N ft., one prone target`
- `reach N ft., all targets in reach`
- `reach N ft., up to three targets`
- `reach N ft. or range N/N ft., one creature`
- `reach N ft. and range N/N ft., one target`
- `range N/N ft., one creature`
- typo variants such as `5ft.`, `5 ft`, `10 feet`, and `reach 30/45 ft.` where `range` was probably intended

## Rider patterns

### 1. Ends after base damage

Most attack descriptions end after the base damage phrase.

```text
Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 24 (3d10 + 6) piercing damage.
```

Observed count: 311.

Planning implication: these are the cleanest candidates for letting Foundry generate the whole attack line, with no remaining rider prose.

### 2. Additional damage in the same hit sentence

Examples:

```text
Hit: 12 (2d6 + 6) slashing damage plus 5 (1d8) cold damage.
Hit: 15 (2d8 + 6) bludgeoning damage + 4 (1d8) fire damage.
Hit: 12 (2d6 + 5) slashing damage and 2 (1d4) fire damage.
Hit: 5 (1d6 + 2) piercing damage, plus 2 (1d4) poison damage.
```

Planning implication: this is usually mechanical damage, not just prose. A later implementation should prefer adding the extra dice to activity damage parts when the damage type is known. The display text may still need authored prose when the wording is unusual.

### 3. Comma-led effect rider

Examples:

```text
Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 14 Constitution saving throw...
Hit: 7 (1d10 + 2) piercing damage, and the target is grappled (escape DC 12).
```

Observed count: 35 for direct `, and` continuation after the first base damage phrase.

Planning implication: this should be treated as rider prose, generally appended after Foundry's generated attack and damage output. The comma matters if preserving exact text, but a normalized display could start this as a sentence instead.

### 4. New-sentence effect rider

Examples:

```text
Hit: 10 (2d6 + 3) fire damage. If the target is a creature or a flammable object, it ignites.
Hit: 32 (6d8 + 5) bludgeoning damage. If the target is a creature, it must succeed on a DC 15 Strength saving throw...
```

Observed count: 41.

Planning implication: these are safer to preserve as separate rider prose after the generated attack line.

### 5. Alternate damage modes

Examples:

```text
Hit: 6 (1d8 + 2) slashing damage, or 7 (1d10 + 2) slashing damage if used with two hands to make a melee attack.
Hit: 10 (2d6 + 3) piercing damage, or 17 (4d6 + 3) piercing damage against a grappled target.
```

Observed count: 23.

Planning implication: these are not just riders. They represent alternate attack modes or conditional damage. A later implementation needs to choose between preserving the alternative in prose, adding a secondary activity, or adding extra damage parts only where the condition can be represented clearly.

### 6. Special `Hit:` text without standard leading damage

Examples:

```text
Hit: The target must make a DC 12 Constitution saving throw...
Hit: The target is then restrained by webbing and takes 9 (2d8) acid damage...
Hit:, 4 (1d4 + 2) slashing damage.
```

Observed count: 16.

Planning implication: these should not be forced into the standard generated attack string unless the source text is cleaned first. Some are real non-damage attacks; some are malformed punctuation.

## Malformed or suspicious source patterns

These should be classified separately from legitimate Foundry formatting decisions.

| Pattern | Example meaning |
|---|---|
| `Melee Attack Weapon:` | Header words reversed |
| `Melee Weapon Attack.` | Period instead of colon after header |
| `Ranged Weapon Attack.` | Period instead of colon after header |
| `Melee Weapon Attack: Melee Weapon Attack:` | Duplicated header |
| `+X to hit` | Placeholder not resolved |
| `Hit:The` | Missing space after `Hit:` and no leading damage |
| `Hit:, 4 (...)` | Extra comma after `Hit:` |
| `piercing.` / `bludgeoning.` | Missing word `damage` |
| `10 feet, one target: 13 (...) damage` | Not in standard attack sentence shape |

Representative files include:

- `src/generated/monsters/ancient-kodo.json`
- `src/generated/monsters/apparition.json`
- `src/generated/monsters/bound-fel-elemental.json`
- `src/generated/monsters/cobra.json`
- `src/generated/monsters/eredar-brute.json`
- `src/generated/monsters/eredar-doommaiden.json`
- `src/generated/monsters/giant-deathweb-spider.json`
- `src/generated/monsters/murloc-tidehunter.json`
- `src/generated/monsters/yeti.json`

## Planning decisions to make

### Decision 1: normalize parser input or source output

Option A: normalize only for parser/activity creation.

- Pros: preserves original description text exactly.
- Pros: low risk for generated JSON text churn.
- Cons: malformed descriptions remain visible in Foundry.

Option B: normalize rendered descriptions in generated output.

- Pros: users see cleaner monster actions.
- Pros: generated descriptions become more regular.
- Cons: changes a lot of generated text and needs careful verification against upstream intent.

Recommended direction: start with parser-side normalization for activity correctness, then separately decide whether visible text cleanup belongs in the same project.

### Decision 2: define the boundary between generated attack text and authored rider text

Possible boundary categories:

| Category | Join style | Example |
|---|---|---|
| `none` | no rider | Base damage ends the description |
| `same-sentence-extra-damage` | `plus`, `and`, `+`, `, plus` | Extra typed damage |
| `comma-effect` | `, and ...` | Save, grapple, poison, prone |
| `sentence-effect` | `. If ...` / `. The ...` | Follow-up condition or restriction |
| `alternative` | `, or ...` | Two-handed damage, conditional damage |
| `special-hit` | custom | `Hit: The target...` |

Recommended direction: make this classification explicit in code/tests when implementation happens. Avoid late punctuation guessing.

### Decision 3: decide what Foundry should generate

Conservative option:

- Keep full source description text as the primary visible rules text.
- Improve activity parsing only.
- Let Foundry's generated chat/activity output exist alongside the preserved description.

More ambitious option:

- Generate the standard attack skeleton from activity data.
- Append only classified rider prose.
- Normalize duplicated damage wording and punctuation.

Recommended direction: use the conservative option first. It matches the repo's current principle that monster item descriptions preserve the full statblock text so nothing is lossy when automation is incomplete.

### Decision 4: model target shapes or leave them as prose

Current activities always target one creature. That is acceptable for many attacks but wrong or incomplete for:

- all targets in reach
- up to three targets
- one prone target/creature
- one Medium or smaller creature
- non-creature targets such as objects or generic targets

Recommended direction: do not try to solve all target semantics in the attack formatting work. If touched, support only the low-risk count/type cases and leave conditional target restrictions in prose.

## Suggested implementation phases

### Phase 1: inventory and tests

- Add fixture tests around current parser behavior for clean attacks, malformed headers, extra damage, alternate damage, and special `Hit:` text.
- Include representative examples from generated monsters rather than invented strings.
- Confirm whether malformed headers currently fall back to utility activities.

### Phase 2: parser-side normalization

- Accept `Melee Weapon Attack.` and `Ranged Weapon Attack.` as attack headers for activity parsing.
- Consider accepting `Melee Attack Weapon:` as a known malformed synonym.
- Normalize duplicated attack headers before parsing.
- Preserve original item description text unless a separate visible cleanup decision is approved.

### Phase 3: rider classification

- Create a small classifier that can split the first standard attack/damage phrase from the remainder.
- Use explicit categories: none, extra damage, comma effect, sentence effect, alternative, special hit.
- Keep ambiguous cases in the full description rather than dropping or rewriting text.

### Phase 4: optional visible description cleanup

Only after parser behavior is stable, decide whether generated descriptions should be rewritten to use Foundry's standard attack formatting plus preserved rider text.

If this phase happens, verify that:

- every original rider survives somewhere visible
- extra damage still rolls where possible
- special `Hit:` attacks are not made misleading
- malformed upstream lines either normalize cleanly or remain unchanged with a logged warning

## Verification notes

Use the repo's normal checks after any implementation:

```bash
npm test
npm run verify
```

For parser-specific work, focused node tests should be added or extended so failures do not require inspecting compiled packs manually.

Useful fault cases to include:

- `Melee Weapon Attack.` should still create an attack activity if parser normalization is chosen.
- `Melee Attack Weapon:` should either create an attack activity by explicit synonym handling or be intentionally rejected with a test documenting that choice.
- `Hit: The target...` should not produce fake base damage.
- `damage, or ... damage` should not be collapsed into unconditional extra damage.
- `all targets in reach` should not silently become a fully accurate one-creature target unless the limitation is documented.

## Open questions

- Should visible generated descriptions be normalized, or should only activity parsing become more tolerant?
- Should alternate damage modes become extra activities, or remain prose?
- Should `one target` map to Foundry target type `creature`, or should some attacks remain less specific?
- Should malformed source lines be fixed upstream-style in conversion mappings, or logged for manual source cleanup?
- Is exact punctuation preservation important once Foundry is generating the attack skeleton, or is semantically equivalent rider text acceptable?
