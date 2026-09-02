# Remove Legacy Homebrewery Monster Parser

## Goal

Remove the obsolete Homebrewery/GMBinder monster parsing path now that
`build/build-actors/main.ts` reads `reference/parsed/wc5e-mom-full.json` directly.

The deletion includes the parser, its two generated intermediate outputs, the
WIP-only validator that consumes those outputs, the `npm run parse` command, and
all active documentation references. The migration plan in
`2026-09-02-migrate-monsters-to-wc5e-mom-full.md` remains historical evidence of
the conversion and output comparison; it should not be deleted or rewritten.

## Verified Scope

These tracked files form the complete executable legacy path:

| Artifact | Role | Consumer |
| --- | --- | --- |
| `build/parse.py` | Parses upstream monster markdown | `npm run parse` only |
| `reference/parsed/monsters.json` | Finished-parser output | `build/validate_wip.py` only |
| `reference/parsed/monsters_wip.json` | WIP-parser output | `build/validate_wip.py` only |
| `build/validate_wip.py` | Reports incomplete or duplicate WIP statblocks | No command or production consumer |

`build/build-actors/main.ts`, `build/verify.py`, `npm run actors`, `npm run pack`,
and `npm run verify` do not read any of these artifacts. The current actor build
was already compared to the pre-migration output: 315 shared NPCs, zero added or
removed records, zero ID changes, and zero document-content changes.

## Implementation Steps

### 1. Remove the obsolete executable artifacts

- [x] Delete `build/parse.py`.
- [x] Delete `build/validate_wip.py`.
- [x] Delete `reference/parsed/monsters.json`.
- [x] Delete `reference/parsed/monsters_wip.json`.

Delete all four in the same change. The validator has no useful purpose without
the parser inputs, and retaining stale generated fixtures would falsely imply
they remain a supported source of truth.

### 2. Remove the public command

- [x] Remove the `parse` script from `package.json`.
- [x] Do not alter the `build` script: it already starts with `npm run spells`
  and then runs `npm run actors`, which now reads the consolidated file.

The cleanup intentionally makes `npm run parse` unavailable. No replacement
command is needed because `wc5e-mom-full.json` is committed source input, not a
build artifact produced in this repository.

### 3. Remove obsolete documentation

- [x] Remove the `npm run parse` row and `validate_wip.py` sentence from
  `README.md`.
- [x] Remove `python3 build/validate_wip.py` from the command list in `CLAUDE.md`.
- [x] Remove the legacy-parser paragraph from `docs/internals/build-pipeline.md`.
- [x] In `docs/internals/sources.md`, remove `parse.py` from the sibling-clone
  source table and remove prose describing it as a retained legacy tool.
- [x] Update the sibling-clone prerequisite wording so it names only scripts
  that still read upstream markdown: `spells`, `spell-lists`, and `backgrounds`.

Do not remove historical mentions inside `docs/superpowers/plans/`; those explain
why the old path existed and why it was safely retired.

### 4. Prove the repository is decoupled

- [x] Search active code and documentation, excluding `docs/superpowers/plans/`,
  for `parse.py`, `validate_wip.py`, `monsters.json`, and `monsters_wip.json`.
  The search must return no active references.
- [x] Run `npm test`.
- [ ] With the upstream sibling clone available and Foundry closed, run
  `npm run build`, followed by `npm run verify`. `build` recompiles every pack;
  the verifier must report all packs as fresh compiles.
- [ ] Run `git diff --check` and review the deletion list before committing.

## Acceptance Criteria

- No runnable script can invoke `build/parse.py` or `build/validate_wip.py`.
- The old intermediate JSON files are absent from the repository.
- `build/build-actors/main.ts` remains the only actor entry point and reads only
  `reference/parsed/wc5e-mom-full.json`.
- The documented normal build has no dependency on upstream monster markdown or
  the removed WIP directory.
- `npm test`, `npm run build`, and `npm run verify` pass after deletion.
- The compiled packs are fresh and contain the same 315 monster actors verified
  during the source migration.