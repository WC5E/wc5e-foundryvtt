# Source of truth: the PDFs are ahead of the repo


**Which source is newer varies per class — check, don't assume.** The PDFs' internal
`CreationDate` (they're Chrome print-to-PDF, so that's when they were printed) against the last
upstream commit touching each class file:

| repo newer (9) | PDF newer (3) |
|---|---|
| Death Knight, Druid, Hunter, Monk, Paladin, **Rogue**, Shaman, Warlock, Warrior | Demon Hunter (2026-02), Mage 3.1 (2025-06), **Priest 3.1.1** (2026-01) |

Most PDFs were printed in **2020**. Use `gh api ".../commits?path=<file>"` for the repo side — a
`--depth 1` clone returns the same shallow commit for every path, which will silently tell you the
repo is newer for everything.

Consequence worth knowing: **Subtle Magic is the OLDER Rogue design.** Its PDF was printed
2020-09-03; the repo's Rogue is 2026-01-08 and uses a third-caster "subtlety spell list" version
instead. We still ship Subtle Magic because the newer design references a spell list that was never
written upstream — older but playable beats newer but unimplementable. Revisit if that list appears.

**The GitHub repo lags the class PDFs.** WC5E is authored in GMBinder; PDFs are exported to the
team's Drive, and the repo is a periodically-synced mirror. Proof: the Rogue PDF replaced the
Subtlety third-caster design with *Subtle Magic*, and that string appears **nowhere** in the repo —
not on `master`, not on the `HHB-v3.1` tag. The PDFs also version per class (Mage 3.1,
Priest 3.1.1, the rest 3.0), which the repo doesn't express.

Also note: the default branch is **`master`**, not `main`. `HHB-v3.1` is a tag with **no release
assets** and is ~2,000 lines of class content *behind* master, so releases are not a useful source.
Of the 20 branches only `Experimental` (+3: a High-Powered Flashlight and an Enroot spell) and
`5etools-conversion` (+42: structured JSON, but only 36 spells against our 101) are alive.

`npm run pdfs` (`build/extract_pdfs.py`) runs `pdftotext -layout` over the class PDFs into
`intermediate/pdf/*.txt`, which is **committed** — small, diffable so a new PDF drop is a reviewable
change, and it keeps normal builds free of both the 145 MB of PDFs and a poppler dependency. Point
it at the PDFs with `WC5E_PDF_DIR`. It is deliberately **not** in the default build.

## Why the builders still parse the markdown, not the PDF text

`pdftotext -layout` preserves columns well enough to read simple tables (the Subtle Magic table
extracts perfectly), but the class progression tables defeat positional parsing: header words are
packed tightly while the values below them are spread wide, e.g. the Warlock's

    Cantrips Spells Spell Slot Demons
    Known Known Slots Level Known
    2          2       1     1st          -

so matching a value to its header by character offset fails, and the two adjacent `Known` columns
can't be told apart. A validation pass comparing PDF-derived to markdown-derived numbers agreed
exactly for Death Knight, Druid, Mage, Priest and Paladin but returned identical (wrong) columns for
Shaman and Warlock. Migrating would need per-class column maps or a coordinate-aware extractor
(pdfplumber gives real x/y per word); positional guessing is not good enough. **Validate against the
current numbers before trusting any replacement.**

## Deliberately not modelled: uses scaling

The Warlock's `Life Tap (1/day → 2/day → 3/day → at will)` and the Warrior's `Extra Attack (2)` at
20 are *uses* progressions. They are **not** wired, on purpose: doing it means editing GoC45's
hand-maintained feature documents to point `uses` at a `@scale.<class>.<key>` value and inventing
ScaleValue identifiers, and a wrong identifier resolves to zero uses **silently** — the same failure
class as the spell-list flag. The feature text states the progression, so nothing is hidden from the
player. Not worth the risk until someone asks.

(The Priest's `Divine Word (2)…(5)` looked like scaling but wasn't — it's the *number known*, i.e.
the ItemChoice count, fixed by aligning its levels to the newer PDF.)

## Known source conflicts, unresolved on purpose

- **Warlock cantrips:** the v3.0 PDF says "you know *two* cantrips", the Heroes Handbook table on
  master says **3**, and the module ships 3. The repo is newer here (2026-01 vs a 2021 PDF), so 3 is
  probably right — but it hasn't been confirmed.
- The Warlock PDF has a **Demons Known** column that isn't modelled at all.
- Features named in the current PDFs but absent from the module: `Malignant Presence`,
  `Druid Path`, `Druidic`, `Sacred Path`, `Divine Calling`, `Empowering Faith`, `Unwavering Faith`,
  `Kalimag`, `Shamanic Binding`, `Fel Study`, `Inner Rage`. Some are subclass-choice markers rather
  than real features — check each before authoring.

# Prerequisite: the upstream source repo


The parsers read the WC5E markdown from a **sibling clone** that is not part of this repo. If it's
missing, `npm run parse` / `npm run spells` / `npm run spell-lists` fail:

```bash
git clone https://github.com/WC5E/Warcraft-5e-Conversion ../Warcraft-5e-Conversion
```

Hard-coded paths inside `../Warcraft-5e-Conversion`:

| Script | Reads |
|---|---|
| `build/parse.py` | `Manual of Monsters, Main File.txt` (finished) and every file in `WIP Manual of Monsters/` |
| `build/extract_spells.py` | `WIP 3.0 Chapters/Chapter 6 Spells.md` (the most complete spell list) |
| `build/build_spell_lists.py` | the same Chapter 6 file, for the per-class spell tables |
| `build/build_backgrounds.py` | `Heroes Handbook, Main File.txt` (`## New Backgrounds`, chapter 3) |

`parse.py` accepts an alternate main-file path as `argv[1]`; `extract_spells.py` does not.
Because `src/` is committed, you can rebuild the packs (`npm run pack`) and edit the item/journal
builders **without** the upstream clone.
