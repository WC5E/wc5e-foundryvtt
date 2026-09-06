# Internals

Detail that `CLAUDE.md` points at rather than carries. `CLAUDE.md` is loaded into every session,
so it holds the things you must know *before* touching anything; these are read when you work in
the area they cover.

| Document | Read it before |
|---|---|
| [sources.md](sources.md) | trusting either the GitHub repo or the class PDFs, or running any parser — includes the sibling-clone prerequisite |
| [build-pipeline.md](build-pipeline.md) | changing a builder, or wondering why a conversion looks odd — the three stages, the escape-hatch tables, and the 1,157 internal UUIDs |
| [spell-content.md](spell-content.md) | touching class spell lists, subclass spells, spell progression, advancement levels or backgrounds |
| [auto-assign.md](auto-assign.md) | changing anything under `module/scripts/`, `module/templates/`, `module/styles/` or `module/assets/missing-spells.json` |
| [releasing.md](releasing.md) | cutting a release, or if this repo is no longer `WC5E/wc5e-foundryvtt` |

Design specs and implementation plans live in `docs/superpowers/`. The auto-assign feature's
manual test checklist is in its plan, not here.
