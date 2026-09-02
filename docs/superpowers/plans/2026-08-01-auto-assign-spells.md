# Auto-Assign Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a GM-facing tool inside the module that searches compendiums the user selects for the non-SRD spells we cannot redistribute, assigns what it finds to WC5E monsters and class spell lists, and reports what it could not find.

**Architecture:** The Python builders already know which spell names they failed to resolve; they emit that knowledge as `assets/missing-spells.json` at build time. New runtime JavaScript (the module's first) loads that manifest, indexes the compendium packs the GM ticks in a tree picker, plans a set of purely additive writes, previews it, and applies it. The planner is a pure function so it can be unit-tested without Foundry.

**Tech Stack:** Python 3 (stdlib only) for the build side; ES modules + Foundry `ApplicationV2` + `HandlebarsApplicationMixin` for the runtime; `node --test` and `python3 -m unittest` (both stdlib) for tests. No new runtime or build dependencies.

**Spec:** `docs/superpowers/specs/2026-08-01-auto-assign-spells-design.md`

## Global Constraints

- Target Foundry **v13 minimum / v14 verified**, dnd5e **5.3.3**. Verified locally against Foundry v14 build 364, Node v22.22.3, Python 3.14.5.
- **No new dependencies**, runtime or dev. Tests use `node --test` and `python3 -m unittest`, both stdlib.
- **No release in this plan.** Do not bump `module.json` `version`, do not touch `download`, do not tag, do not run `npm run release`. The user tests manually first.
- **Only spell *names* may enter the repo.** No non-SRD spell text, descriptions, or mechanics. No naming or detection of any particular third-party content source in code or UI copy.
- **All writes are additive and idempotent.** Never remove, never overwrite. A second run must report zero additions.
- **Build output is deterministic.** After `npm run build`, `git status` must be clean. `assets/missing-spells.json` must be written with `sort_keys=True, indent=2, ensure_ascii=False` and a trailing newline.
- Every document written by a builder carries `_stats: {"systemId": "dnd5e", "systemVersion": "5.3.3"}`. The manifest is not a Foundry document and does not.
- `npm run verify` must pass at the end of every task that touches the build side.
- Commit after every task.

## File Structure

**Created — build side**
- `build/missing_spells.py` — accumulates and writes the manifest. Sole owner of `assets/missing-spells.json`.
- `tests/test_missing_spells.py` — unit tests for the above.

**Created — runtime**
- `scripts/wc5e.mjs` — entry point: settings, menu registration, first-run prompt.
- `scripts/auto-assign/manifest.mjs` — manifest fetch/validate + name normalisation.
- `scripts/auto-assign/tree.mjs` — pure folder/pack tree construction for the picker.
- `scripts/auto-assign/index.mjs` — build the search index from selected packs.
- `scripts/auto-assign/plan.mjs` — pure planner.
- `scripts/auto-assign/apply.mjs` — gather current state, execute a plan.
- `scripts/auto-assign/app.mjs` — the `ApplicationV2` dialog.
- `templates/auto-assign/configure.hbs`, `nodes.hbs`, `preview.hbs`, `report.hbs`

**Created — tests**
- `tests/normalise.test.mjs`, `tests/tree.test.mjs`, `tests/index.test.mjs`, `tests/plan.test.mjs`, `tests/apply.test.mjs`

**Modified**
- `build/spell_embed.py` — keep raw spell names and casting context on unresolved entries.
- `build/convert-monster-json/main.ts` — hand the monster records to the collector.
- `build/build_spell_lists.py` — hand the class-list records to the collector.
- `build/build_subclass_spells.py` — hand the subclass-list records to the collector.
- `build/verify.py` — new `check_missing_manifest()`.
- `build/release.mjs:25` — add `scripts` and `templates` to `RUNTIME`.
- `module.json` — add `esmodules`. **No version change.**
- `package.json` — add `test` script.
- `CLAUDE.md`, `README.md`, `build/build_journal.py` — document the tool.

**Deviation from the spec:** the manifest has no `moduleVersion` field. Including it would make the file change on every version bump and turn a bump into a mandatory rebuild. The runtime reads the version from `game.modules.get("wc5e-foundryvtt").version` instead. Task 1 amends the spec to match.

---

### Task 1: The manifest collector

The manifest is written by three separate builders that run at different times in `npm run build`. Each must replace only its own section without disturbing the others — the same read-modify-write discipline `build_spell_lists.register_in_manifest()` already uses for `flags.dnd5e.spellLists`.

**Files:**
- Create: `build/missing_spells.py`
- Create: `tests/test_missing_spells.py`
- Modify: `package.json` (add `test` script)
- Modify: `docs/superpowers/specs/2026-08-01-auto-assign-spells-design.md` (drop `moduleVersion`)

**Interfaces:**
- Produces:
  - `MANIFEST_VERSION: int` (= 1)
  - `PATH: str` — absolute path to `assets/missing-spells.json`
  - `load() -> dict` — reads the manifest, or returns a fresh skeleton `{"version": 1, "aliases": {}, "monsters": {}, "spellLists": {}}`
  - `save(data: dict) -> None`
  - `set_aliases(aliases: dict[str, str]) -> None`
  - `set_monsters(records: dict[str, dict]) -> None` — replaces the entire `monsters` map
  - `set_spell_lists(journal_id: str, records: dict[str, dict]) -> None` — replaces only entries whose key begins with `f"{journal_id}."`, leaving the other journal's entries alone

- [ ] **Step 1: Write the failing test**

Create `tests/test_missing_spells.py`:

```python
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build"))
import missing_spells


class TempManifest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self._orig = missing_spells.PATH
        missing_spells.PATH = os.path.join(self._dir.name, "missing-spells.json")

    def tearDown(self):
        missing_spells.PATH = self._orig
        self._dir.cleanup()


class TestSkeleton(TempManifest):
    def test_load_returns_skeleton_when_absent(self):
        d = missing_spells.load()
        self.assertEqual(d["version"], missing_spells.MANIFEST_VERSION)
        self.assertEqual(d["monsters"], {})
        self.assertEqual(d["spellLists"], {})
        self.assertEqual(d["aliases"], {})

    def test_save_then_load_roundtrips(self):
        missing_spells.set_monsters({"abc": {"name": "Ghoul", "pack": "monsters", "spells": []}})
        self.assertEqual(missing_spells.load()["monsters"]["abc"]["name"], "Ghoul")

    def test_save_is_deterministic_and_newline_terminated(self):
        missing_spells.set_aliases({"b": "2", "a": "1"})
        first = open(missing_spells.PATH, encoding="utf-8").read()
        missing_spells.set_aliases({"a": "1", "b": "2"})
        second = open(missing_spells.PATH, encoding="utf-8").read()
        self.assertEqual(first, second)
        self.assertTrue(first.endswith("\n"))
        self.assertLess(first.index('"a"'), first.index('"b"'))


class TestSectionIsolation(TempManifest):
    def test_set_monsters_replaces_whole_section(self):
        missing_spells.set_monsters({"a": {"name": "A", "pack": "monsters", "spells": []}})
        missing_spells.set_monsters({"b": {"name": "B", "pack": "monsters", "spells": []}})
        self.assertEqual(sorted(missing_spells.load()["monsters"]), ["b"])

    def test_set_spell_lists_preserves_the_other_journal(self):
        missing_spells.set_spell_lists("JCLASS", {
            "JCLASS.p1": {"name": "Mage Spells", "identifier": "wc5e-mage",
                          "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JSUB", {
            "JSUB.p9": {"name": "Study of Destruction Spells", "identifier": "sub",
                        "pack": "spell-lists", "spells": []}})
        keys = sorted(missing_spells.load()["spellLists"])
        self.assertEqual(keys, ["JCLASS.p1", "JSUB.p9"])

    def test_set_spell_lists_replaces_only_its_own_journal(self):
        missing_spells.set_spell_lists("JCLASS", {"JCLASS.p1": {"name": "one", "identifier": "i",
                                                                "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JSUB", {"JSUB.p9": {"name": "keep", "identifier": "i",
                                                            "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JCLASS", {"JCLASS.p2": {"name": "two", "identifier": "i",
                                                                "pack": "spell-lists", "spells": []}})
        keys = sorted(missing_spells.load()["spellLists"])
        self.assertEqual(keys, ["JCLASS.p2", "JSUB.p9"])

    def test_prefix_match_is_on_the_dot_boundary(self):
        """A journal id that is a prefix of another must not be clobbered."""
        missing_spells.set_spell_lists("JA", {"JA.p1": {"name": "a", "identifier": "i",
                                                        "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JAB", {"JAB.p1": {"name": "b", "identifier": "i",
                                                          "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JAB", {"JAB.p2": {"name": "b2", "identifier": "i",
                                                          "pack": "spell-lists", "spells": []}})
        self.assertEqual(sorted(missing_spells.load()["spellLists"]), ["JA.p1", "JAB.p2"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'missing_spells'`

- [ ] **Step 3: Write the implementation**

Create `build/missing_spells.py`:

```python
#!/usr/bin/env python3
"""missing_spells.py -- Collect the spell names we could not resolve at build time.

Three builders contribute: build/convert-monster-json/main.ts for monsters, and
build_spell_lists.py / build_subclass_spells.py for the two spell-list journals.
They run at different points in `npm run build`, so each replaces only its own
section -- the same read-modify-write discipline register_in_manifest() uses.

Only spell *names* are recorded. Nothing here is redistributable content; the
runtime tool uses these names to search the GM's own compendiums.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

MANIFEST_VERSION = 1
PATH = os.path.join(REPO, "assets", "missing-spells.json")


def _skeleton():
    return {"version": MANIFEST_VERSION, "aliases": {}, "monsters": {}, "spellLists": {}}


def load():
    if not os.path.exists(PATH):
        return _skeleton()
    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("version") != MANIFEST_VERSION:
        # An older file cannot be merged into safely; start clean. A full build
        # rewrites every section anyway.
        return _skeleton()
    for k, v in _skeleton().items():
        data.setdefault(k, v)
    return data


def save(data):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")


def set_aliases(aliases):
    data = load()
    data["aliases"] = dict(aliases)
    save(data)


def set_monsters(records):
    data = load()
    data["monsters"] = dict(records)
    save(data)


def set_spell_lists(journal_id, records):
    """Replace only the pages belonging to `journal_id`.

    Keys are "<journalId>.<pageId>". Match on the dot boundary so a journal id
    that happens to be a prefix of another one is not clobbered.
    """
    data = load()
    prefix = f"{journal_id}."
    kept = {k: v for k, v in data["spellLists"].items() if not k.startswith(prefix)}
    kept.update(records)
    data["spellLists"] = kept
    save(data)
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the `test` script**

In `package.json`, add to `scripts` (keep the existing entries):

```json
    "test": "python3 -m unittest discover -s tests -p 'test_*.py' && node --test 'tests/**/*.test.mjs'"
```

The glob is required and must stay quoted. On Node 22, `node --test tests/` hands the bare
directory to the CJS resolver and dies with `MODULE_NOT_FOUND`; the glob form matches top-level
`tests/*.test.mjs` as well as any subdirectory, and exits 0 when nothing matches yet. The
`*.test.mjs` files arrive from Task 5 onwards.

Run: `npm test`
Expected: the Python tests pass, node reports 0 tests, exit 0.

- [ ] **Step 6: Amend the spec so it matches**

In `docs/superpowers/specs/2026-08-01-auto-assign-spells-design.md`, in the JSON schema block, delete the line:

```json
  "moduleVersion": "1.17.0",
```

and immediately after the schema block's closing fence add:

```markdown
There is deliberately no module-version field: it would make the manifest change on every
version bump and turn a bump into a mandatory rebuild. The runtime reads the version from
`game.modules.get("wc5e-foundryvtt").version`.
```

- [ ] **Step 7: Commit**

```bash
git add build/missing_spells.py tests/test_missing_spells.py package.json docs/superpowers/specs/2026-08-01-auto-assign-spells-design.md
git commit -m "Add the missing-spells manifest collector

Three builders contribute unresolved spell names at different points in the
build, so each replaces only its own section. Adds the repo's first tests
(stdlib unittest, no new dependencies) and an npm test script."
```

---

### Task 2: Emit monster records from the build

`spell_embed.parse_spellcasting()` currently throws away the original spelling — `names = [_norm(x) for x in re.split(...)]` — and `embed_spellcasting()` returns unmatched entries as bare normalised strings. Both must carry the raw name and the casting context so the manifest can set the right preparation mode.

One known-bad parse must not reach the manifest: the string `shadow bolt 1st-5th level : arms of hadar`, a mis-split of a statblock line. Entries containing a colon are statblock fragments, not spell names.

**Files:**
- Modify: `build/spell_embed.py` — `parse_spellcasting()`, `embed_spellcasting()`
- Modify: `build/convert-monster-json/main.ts` — the spellcasting report
- Test: `tests/test_missing_spells.py` (extend)

**Interfaces:**
- Consumes: `missing_spells.set_monsters`, `missing_spells.set_aliases` from Task 1.
- Produces:
  - `spell_embed.parse_spellcasting(text)` — each group's `names` becomes a list of `(raw, key)` tuples instead of a list of strings.
  - `spell_embed.embed_spellcasting(...)` — second return value becomes `list[dict]`, each `{"name": raw, "key": key, "prep": str, "level": int|None, "perDay": int|None}`.
  - `build/convert-monster-json/actor.ts` `SPELL_REPORT` entries keep their `(name, matched, unmatched)` shape; `unmatched` now holds those dicts.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_missing_spells.py`:

```python
import spell_embed


class TestUnmatchedRecords(unittest.TestCase):
    TRAIT = ("The mage is a 5th-level spellcaster. Its spellcasting ability is Intelligence "
             "(spell save DC 14). It has the following spells prepared:\n"
             "Cantrips (at will): fire bolt, shape water\n"
             "1st level (4 slots): magic missile, ice knife\n")

    INNATE = ("Its innate spellcasting ability is Charisma (spell save DC 13).\n"
              "At will: blade ward\n"
              "2/day each: hex\n")

    def test_parse_keeps_raw_and_normalised_names(self):
        parsed = spell_embed.parse_spellcasting(self.TRAIT)
        pairs = [p for g in parsed["groups"] for p in g["names"]]
        self.assertIn(("shape water", "shape water"), pairs)
        self.assertTrue(all(isinstance(p, tuple) and len(p) == 2 for p in pairs))

    def test_unmatched_records_carry_preparation_context(self):
        actor = {"system": {"attributes": {}, "spells": {}}, "items": []}
        mon = {"traits": [{"name": "Spellcasting", "text": self.TRAIT}],
               "abilities": {"int": 16}}
        _, unmatched = spell_embed.embed_spellcasting(
            actor, mon, "actor1", 3, lambda s: (s - 10) // 2)
        by_key = {u["key"]: u for u in unmatched}
        self.assertIn("shape water", by_key)
        self.assertEqual(by_key["shape water"]["prep"], "prepared")
        self.assertEqual(by_key["shape water"]["level"], 0)
        self.assertIsNone(by_key["shape water"]["perDay"])

    def test_innate_records_carry_per_day(self):
        actor = {"system": {"attributes": {}, "spells": {}}, "items": []}
        mon = {"traits": [{"name": "Innate Spellcasting", "text": self.INNATE}],
               "abilities": {"cha": 16}}
        _, unmatched = spell_embed.embed_spellcasting(
            actor, mon, "actor2", 3, lambda s: (s - 10) // 2)
        by_key = {u["key"]: u for u in unmatched}
        self.assertEqual(by_key["blade ward"]["prep"], "atwill")
        self.assertEqual(by_key["hex"]["prep"], "innate")
        self.assertEqual(by_key["hex"]["perDay"], 2)

    def test_statblock_fragments_are_dropped(self):
        """'shadow bolt 1st-5th level : arms of hadar' is a mis-split line, not a spell."""
        parsed = spell_embed.parse_spellcasting(
            "Its spellcasting ability is Charisma (spell save DC 13).\n"
            "1st level (4 slots): shadow bolt 1st-5th level : arms of hadar, hex\n")
        keys = [k for g in parsed["groups"] for _, k in g["names"]]
        self.assertNotIn("shadow bolt 1st-5th level : arms of hadar", keys)
        self.assertIn("hex", keys)
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: FAIL — `parse_spellcasting` returns plain strings, so the tuple assertions fail.

- [ ] **Step 3: Keep the raw name in `parse_spellcasting`**

In `build/spell_embed.py`, inside `parse_spellcasting()`, replace the name-building block:

```python
        names = [_norm(x) for x in re.split(r"[,;]", body)]
        # Only drop obvious intro-prose fragments. NOT "the "/"of" etc. -- those
        # occur in real spell names (Spare the Dying, Light of the Protector).
        # Non-spell tokens simply won't match an index and fall through as
        # unresolved, so the filter can stay minimal.
        BAD = ("spellcast", "following", "innately", "material component")
        names = [x for x in names if 3 <= len(x) <= 45
                 and not any(w in x for w in BAD)]
```

with:

```python
        # Keep the original spelling alongside the lookup key: the key is
        # lowercased for matching, but the raw name is what a human reads in
        # the auto-assign report.
        pairs = [(re.sub(r"\s+", " ", x).strip(" .:;-"), _norm(x))
                 for x in re.split(r"[,;]", body)]
        # Only drop obvious intro-prose fragments. NOT "the "/"of" etc. -- those
        # occur in real spell names (Spare the Dying, Light of the Protector).
        # Non-spell tokens simply won't match an index and fall through as
        # unresolved, so the filter can stay minimal. A colon means the source
        # line was mis-split and the fragment spans two statblock groups.
        BAD = ("spellcast", "following", "innately", "material component")
        names = [(raw, key) for raw, key in pairs
                 if 3 <= len(key) <= 45 and ":" not in key
                 and not any(w in key for w in BAD)]
```

- [ ] **Step 4: Return records from `embed_spellcasting`**

Still in `build/spell_embed.py`, in `embed_spellcasting()`, replace the embed loop:

```python
    for g in parsed["groups"]:
        for nm in g["names"]:
            if nm in seen:
                continue
            seen.add(nm)
            entry = custom.get(nm) or srd.get(nm)
            if not entry:
                unmatched.append(nm)
                continue
```

with:

```python
    for g in parsed["groups"]:
        for raw, nm in g["names"]:
            if nm in seen:
                continue
            seen.add(nm)
            entry = custom.get(nm) or srd.get(nm)
            if not entry:
                unmatched.append({"name": raw, "key": nm, "prep": g["prep"],
                                  "level": g.get("level"),
                                  "perDay": g.get("per_day")})
                continue
```

Update the docstring line to read:

```python
    """Mutate `actor` in place. Returns (matched:int, unmatched:list[dict])."""
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: PASS, 11 tests.

- [ ] **Step 6: Write the monster section from `build/convert-monster-json/main.ts`**

In `build/convert-monster-json/main.ts`, import the manifest writer alongside the spell embedder:

```python
import missing_spells
```

Then replace the spellcasting report block (currently at the end of `main()`):

```python
    # spellcasting report
    total_m = sum(m for _, m, _ in SPELL_REPORT)
    all_un = [u for _, _, un in SPELL_REPORT for u in un]
    from collections import Counter
    un_counts = Counter(all_un)
    print(f"\nSpellcasting: {len(SPELL_REPORT)} casters | {total_m} spells embedded"
          f" | {len(all_un)} references unresolved ({len(un_counts)} distinct)")
    if un_counts:
        top = ", ".join(f"{n}(x{c})" for n, c in un_counts.most_common(20))
        print(f"  unresolved (stay as text): {top}")
```

with:

```python
    # spellcasting report
    total_m = sum(m for _, _, m, _ in SPELL_REPORT)
    all_un = [u for _, _, _, un in SPELL_REPORT for u in un]
    from collections import Counter
    un_counts = Counter(u["key"] for u in all_un)
    print(f"\nSpellcasting: {len(SPELL_REPORT)} casters | {total_m} spells embedded"
          f" | {len(all_un)} references unresolved ({len(un_counts)} distinct)")
    if un_counts:
        top = ", ".join(f"{n}(x{c})" for n, c in un_counts.most_common(20))
        print(f"  unresolved (stay as text): {top}")

    # The auto-assign tool searches the GM's own compendiums for these at runtime.
    records = {}
    for actor_id, name, _matched, unmatched in SPELL_REPORT:
        if not unmatched:
            continue
        records[actor_id] = {
            "name": name,
            "pack": "monsters",
            "spells": sorted(unmatched, key=lambda u: u["key"]),
        }
    missing_spells.set_aliases(spell_embed.ALIAS)
    missing_spells.set_monsters(records)
    print(f"  auto-assign manifest: {len(records)} monsters, "
          f"{sum(len(r['spells']) for r in records.values())} spell references")
```

`SPELL_REPORT` holds `(name, matched, unmatched)` and carries no actor id, so widen it. In
`build/convert-monster-json/actor.ts`, change:

```python
        SPELL_REPORT.append((mon["name"], matched, unmatched))
```

to:

```python
        SPELL_REPORT.append((actor_id, mon["name"], matched, unmatched))
```

`actor_id` is already in scope there — it is passed to `embed_spellcasting()` three lines above.
The two unpackings in the report block above must widen to match, which the replacement text
already does (`sum(m for _, _, m, _ in ...)` and `[u for _, _, _, un in ...]`).

- [ ] **Step 7: Rebuild and confirm the manifest appears**

Run: `npm run parse && npm run spells && npm run actors`
Expected: the actors step prints `auto-assign manifest: 61 monsters, 154 spell references`, and `assets/missing-spells.json` exists with a populated `monsters` map and a populated `aliases` map.

Confirm the bad parse is gone:

Run: `grep -c "arms of hadar" assets/missing-spells.json`
Expected: `0`

- [ ] **Step 8: Confirm determinism**

Run: `npm run actors && git status --porcelain assets/missing-spells.json`
Expected: no output — a second run produces a byte-identical file.

- [ ] **Step 9: Commit**

```bash
git add build/spell_embed.py build/convert-monster-json tests/test_missing_spells.py assets/missing-spells.json
git commit -m "Record unresolved monster spells in the auto-assign manifest

parse_spellcasting() kept only the normalised name, so the report could not
show the original spelling and nothing downstream knew the preparation mode.
It now carries (raw, key) pairs and embed_spellcasting() returns records with
prep/level/perDay. Also drops a mis-split statblock fragment that was being
treated as a spell name."
```

---

### Task 3: Emit spell-list records from the build

Both list builders already collect their omitted names — `build_spell_lists.py` as `(name, kind)` pairs, `build_subclass_spells.py` as bare names. They each need to write their own journal's section of the manifest.

**Files:**
- Modify: `build/build_spell_lists.py` — `main()`
- Modify: `build/build_subclass_spells.py` — `main()`

**Interfaces:**
- Consumes: `missing_spells.set_spell_lists`, `spell_embed`-compatible normalisation.
- Produces: `spellLists` entries keyed `"<journalId>.<pageId>"`, each `{"name", "identifier", "pack": "spell-lists", "spells": [{"name", "key", "source"}]}`.

Note: these builders normalise with their own local `squash()` + `ALIAS`, not `spell_embed._norm()`. The manifest's `key` must be what the **runtime** normaliser produces, and the runtime is a port of `spell_embed._norm()`. So both builders must key their records with `spell_embed._norm()` — importing it, not reimplementing it. Task 4 has a parity test that would catch a mistake here.

- [ ] **Step 1: Write class-list records**

In `build/build_spell_lists.py`, add to the imports:

```python
import missing_spells
import spell_embed
```

The `page()` helper computes `pid = make_id(journal_id, identifier)`; `main()` needs the same id to key the record. In `main()`, replace:

```python
        pages.append(page(jid, cls, ident, uuids, missing, sort))
        sort += 100000
        report.append((cls, ident, len(uuids), len(missing), [m[0] for m in missing]))
```

with:

```python
        pg = page(jid, cls, ident, uuids, missing, sort)
        pages.append(pg)
        if missing:
            missing_records[f"{jid}.{pg['_id']}"] = {
                "name": pg["name"],
                "identifier": ident,
                "pack": "spell-lists",
                "spells": sorted(
                    ({"name": n, "key": spell_embed._norm(n), "source": m}
                     for n, m in missing),
                    key=lambda s: s["key"]),
            }
        sort += 100000
        report.append((cls, ident, len(uuids), len(missing), [m[0] for m in missing]))
```

Declare the accumulator next to `pages, report = [], []`:

```python
    pages, report, missing_records = [], [], {}
```

and after `register_in_manifest(jid, pages)` add:

```python
    missing_spells.set_spell_lists(jid, missing_records)
```

- [ ] **Step 2: Run it and check**

Run: `npm run spell-lists`
Expected: succeeds. Then:

Run: `python3 -c "import json;d=json.load(open('assets/missing-spells.json'));print(len(d['spellLists']), sum(len(v['spells']) for v in d['spellLists'].values()))"`
Expected: `7 219` — the seven class pages and their 219 omitted entries.

- [ ] **Step 3: Write subclass-list records**

In `build/build_subclass_spells.py`, add to the imports:

```python
import missing_spells
import spell_embed
```

In `main()`, in the block that builds the expanded-list journal, replace:

```python
        pages, sort = [], 100000
        for name, ident, uuids, missing in expanded:
            pages.append(page(jid, name, ident, uuids, missing, sort))
            sort += 100000
```

with:

```python
        pages, sort, missing_records = [], 100000, {}
        for name, ident, uuids, missing in expanded:
            pg = page(jid, name, ident, uuids, missing, sort)
            pages.append(pg)
            if missing:
                missing_records[f"{jid}.{pg['_id']}"] = {
                    "name": pg["name"],
                    "identifier": ident,
                    "pack": "spell-lists",
                    "spells": sorted(
                        ({"name": n, "key": spell_embed._norm(n), "source": ""}
                         for n in missing),
                        key=lambda s: s["key"]),
                }
            sort += 100000
        missing_spells.set_spell_lists(jid, missing_records)
```

- [ ] **Step 4: Run the full build and check both journals survive**

Run: `npm run build`
Expected: completes. Then:

Run: `python3 -c "import json;d=json.load(open('assets/missing-spells.json'));print(len(d['spellLists']), sum(len(v['spells']) for v in d['spellLists'].values()), len(d['monsters']))"`
Expected: `9 224 61` — seven class pages plus two subclass pages (Affliction has no omissions), 224 entries, 61 monsters.

This is the check that matters: if the second builder had clobbered the first, the page count would be 2 rather than 9.

- [ ] **Step 5: Confirm order-independence**

Run: `npm run subclass-spells && npm run spell-lists && npm run subclass-spells && python3 -c "import json;d=json.load(open('assets/missing-spells.json'));print(len(d['spellLists']))"`
Expected: `9` — running them in either order and repeatedly holds the count.

- [ ] **Step 6: Confirm determinism and verify**

Run: `npm run build && git status --porcelain && npm run verify`
Expected: `git status --porcelain` shows only `assets/missing-spells.json` as a new untracked file (or nothing, if already added); `npm run verify` passes.

- [ ] **Step 7: Commit**

```bash
git add build/build_spell_lists.py build/build_subclass_spells.py assets/missing-spells.json
git commit -m "Record omitted spell-list entries in the auto-assign manifest

Both list builders write into one manifest section, so each replaces only its
own journal's keys -- the same hazard that made them overwrite each other's
flags.dnd5e.spellLists entries. Keys use spell_embed._norm() so they match
what the runtime normaliser produces."
```

---

### Task 4: Validate the manifest in `verify.py`

**Files:**
- Modify: `build/verify.py` — add `check_missing_manifest()`, call it from `main()`

**Interfaces:**
- Consumes: `packs` from `load_all()`.
- Produces: a `missing` check category; appends a note with the totals.

- [ ] **Step 1: Add the check**

In `build/verify.py`, add before `def check_release_shape(manifest):`:

```python
def check_missing_manifest(packs):
    """The auto-assign manifest must point at documents that still exist.

    It is generated, so a stale entry means a builder and the manifest have
    drifted -- and a stale entry is invisible in play: the tool would simply
    skip that monster.
    """
    path = os.path.join(REPO, "assets", "missing-spells.json")
    if not os.path.exists(path):
        fail("missing", "assets/missing-spells.json not found -- run npm run build")
        return
    try:
        data = json.load(open(path, encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail("missing", f"assets/missing-spells.json is not valid JSON: {e}")
        return
    if data.get("version") != 1:
        fail("missing", f"unknown manifest version {data.get('version')!r}, expected 1")
        return
    if not data.get("aliases"):
        fail("missing", "manifest has no aliases -- the runtime normaliser would drift")

    actor_ids = {d["_id"] for _, d in packs.get("monsters", []) if d.get("_id")}
    pages = set()
    for _, d in packs.get("spell-lists", []):
        for p in d.get("pages", []):
            pages.add(f"{d['_id']}.{p['_id']}")

    n_spells = 0
    for aid, rec in data.get("monsters", {}).items():
        if aid not in actor_ids:
            fail("missing", f"manifest names monster {aid} ({rec.get('name')}) "
                            "which is not in src/monsters")
        n_spells += len(rec.get("spells", []))
        for s in rec.get("spells", []):
            if not s.get("name") or not s.get("key"):
                fail("missing", f"monster {rec.get('name')} has a spell record "
                                f"with an empty name/key: {s!r}")
            if s.get("prep") not in ("prepared", "atwill", "innate"):
                fail("missing", f"monster {rec.get('name')} spell {s.get('name')!r} "
                                f"has an unknown prep {s.get('prep')!r}")

    n_entries = 0
    for key, rec in data.get("spellLists", {}).items():
        if key not in pages:
            fail("missing", f"manifest names spell-list page {key} "
                            f"({rec.get('name')}) which does not exist")
        n_entries += len(rec.get("spells", []))
        for s in rec.get("spells", []):
            if not s.get("name") or not s.get("key"):
                fail("missing", f"spell list {rec.get('name')} has a record "
                                f"with an empty name/key: {s!r}")

    notes.append(f"auto-assign manifest: {len(data.get('monsters', {}))} monsters "
                 f"({n_spells} refs), {len(data.get('spellLists', {}))} spell-list "
                 f"pages ({n_entries} entries)")
```

Then in `main()`, add the call after `check_spell_coverage(packs, idents)`:

```python
    check_missing_manifest(packs)
```

- [ ] **Step 2: Confirm it passes on good data**

Run: `npm run verify`
Expected: passes, and the output includes a line like
`· auto-assign manifest: 61 monsters (154 refs), 9 spell-list pages (224 entries)`

- [ ] **Step 3: Fault-inject — a stale monster id**

The repo's standing rule is that a check which has never fired is worthless.

```bash
python3 - <<'EOF'
import json
p = "assets/missing-spells.json"
d = json.load(open(p))
k = sorted(d["monsters"])[0]
d["monsters"]["deadbeefdeadbeef"] = d["monsters"].pop(k)
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False, sort_keys=True)
EOF
npm run verify
```

Expected: exits non-zero with
`[missing] manifest names monster deadbeefdeadbeef (…) which is not in src/monsters`

- [ ] **Step 4: Fault-inject — a bad prep value**

```bash
git checkout -- assets/missing-spells.json
python3 - <<'EOF'
import json
p = "assets/missing-spells.json"
d = json.load(open(p))
k = sorted(d["monsters"])[0]
d["monsters"][k]["spells"][0]["prep"] = "sometimes"
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False, sort_keys=True)
EOF
npm run verify
```

Expected: exits non-zero with an `[missing] … has an unknown prep 'sometimes'` failure.

- [ ] **Step 5: Restore and confirm clean**

Run: `git checkout -- assets/missing-spells.json && npm run verify`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add build/verify.py
git commit -m "Verify the auto-assign manifest against the packs

A stale entry is invisible in play -- the tool would silently skip that
monster. Fault-injected with a dangling actor id and a bad prep value; both
fire."
```

---

### Task 5: Runtime name normalisation and manifest loading

The JS normaliser is a port of `spell_embed._norm()`. If the two drift, every lookup misses and the tool silently finds nothing. The parity test in Step 1 is the guard: it runs the JS normaliser over every record in the real manifest and asserts it reproduces the `key` Python wrote.

**Files:**
- Create: `scripts/auto-assign/manifest.mjs`
- Create: `tests/normalise.test.mjs`

**Interfaces:**
- Produces:
  - `MANIFEST_VERSION` — `1`
  - `normaliseName(raw: string, aliases?: object) -> string`
  - `loadManifest(fetchImpl?) -> Promise<{aliases, monsters, spellLists}>` — throws `Error` on a missing file, bad JSON, or unknown version.
  - `manifestTotals(manifest) -> {monsters: number, monsterSpells: number, lists: number, listSpells: number}`

- [ ] **Step 1: Write the failing test**

Create `tests/normalise.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normaliseName, loadManifest, manifestTotals, MANIFEST_VERSION }
  from "../scripts/auto-assign/manifest.mjs";

test("lowercases and collapses whitespace", () => {
  assert.equal(normaliseName("  Ice   Knife "), "ice knife");
});

test("strips source superscripts", () => {
  assert.equal(normaliseName("Absorb Elements ^XGE^"), "absorb elements");
});

test("strips the custom-spell marker and asterisks", () => {
  assert.equal(normaliseName("✦Shadow Bolt*"), "shadow bolt");
});

test("drops parenthesised suffixes", () => {
  assert.equal(normaliseName("Fireball (self only)"), "fireball");
});

test("strips leading and trailing punctuation", () => {
  assert.equal(normaliseName("- hex."), "hex");
});

test("applies aliases last", () => {
  assert.equal(normaliseName("Call Lighting", { "call lightning": "x", "call lighting": "call lightning" }),
    "call lightning");
});

test("tolerates null and undefined", () => {
  assert.equal(normaliseName(null), "");
  assert.equal(normaliseName(undefined), "");
});

test("matches the keys Python wrote, for every record in the real manifest", () => {
  const m = JSON.parse(fs.readFileSync("assets/missing-spells.json", "utf8"));
  const records = [
    ...Object.values(m.monsters).flatMap(r => r.spells),
    ...Object.values(m.spellLists).flatMap(r => r.spells),
  ];
  assert.ok(records.length > 300, `expected the real manifest, got ${records.length} records`);
  for ( const r of records ) {
    assert.equal(normaliseName(r.name, m.aliases), r.key,
      `JS and Python normalisers disagree on ${JSON.stringify(r.name)}`);
  }
});

test("loadManifest rejects an unknown version", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: 99 }) });
  await assert.rejects(() => loadManifest(fake), /version/i);
});

test("loadManifest rejects a failed fetch", async () => {
  const fake = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => loadManifest(fake), /404/);
});

test("loadManifest fills in absent sections", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ version: MANIFEST_VERSION }) });
  const m = await loadManifest(fake);
  assert.deepEqual(m.monsters, {});
  assert.deepEqual(m.spellLists, {});
  assert.deepEqual(m.aliases, {});
});

test("manifestTotals counts documents and references separately", () => {
  const m = {
    monsters: { a: { spells: [{}, {}] }, b: { spells: [{}] } },
    spellLists: { "j.p": { spells: [{}, {}, {}] } },
  };
  assert.deepEqual(manifestTotals(m),
    { monsters: 2, monsterSpells: 3, lists: 1, listSpells: 3 });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/normalise.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/auto-assign/manifest.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/auto-assign/manifest.mjs`:

```javascript
/**
 * The auto-assign manifest: the spell names this module could not resolve at
 * build time, so the runtime tool knows what to go looking for.
 *
 * normaliseName() is a port of spell_embed._norm() in the Python build. If the
 * two drift, every lookup misses and the tool silently finds nothing --
 * tests/normalise.test.mjs checks the port against every record in the real
 * manifest for exactly that reason.
 */

export const MANIFEST_VERSION = 1;

const MANIFEST_PATH = "modules/wc5e-foundryvtt/assets/missing-spells.json";

/**
 * @param {string} raw            a spell name as printed in the source
 * @param {object} [aliases]      manifest alias table, applied last
 * @returns {string}              the lookup key
 */
export function normaliseName(raw, aliases = {}) {
  let n = String(raw ?? "").toLowerCase();
  n = n.replace(/\^[a-z]+\^/g, "");
  n = n.replace(/✦/g, "").replace(/\*/g, "");
  n = n.replace(/\([^)]*\)/g, "");
  n = n.replace(/<\/?br>/g, "");
  // Collapse first, then strip -- Task 2 reordered these two steps in
  // spell_embed._norm() (stripping first leaves a trailing space behind a
  // newline). This port must stay in the same order.
  n = n.replace(/\s+/g, " ");
  n = n.replace(/^[ .:;-]+/, "").replace(/[ .:;-]+$/, "");
  return Object.prototype.hasOwnProperty.call(aliases, n) ? aliases[n] : n;
}

/**
 * @param {Function} [fetchImpl]  injected for tests
 * @returns {Promise<{aliases: object, monsters: object, spellLists: object}>}
 * @throws {Error} on a missing file, bad JSON, or an unknown version
 */
export async function loadManifest(fetchImpl = fetch) {
  const res = await fetchImpl(MANIFEST_PATH);
  if ( !res.ok ) throw new Error(`Could not load ${MANIFEST_PATH} (HTTP ${res.status})`);
  const data = await res.json();
  if ( data?.version !== MANIFEST_VERSION ) {
    throw new Error(`Unsupported manifest version ${data?.version}, expected ${MANIFEST_VERSION}`);
  }
  return {
    aliases: data.aliases ?? {},
    monsters: data.monsters ?? {},
    spellLists: data.spellLists ?? {},
  };
}

/** Counts for the dialog's target labels and the first-run prompt. */
export function manifestTotals(manifest) {
  const monsters = Object.values(manifest.monsters ?? {});
  const lists = Object.values(manifest.spellLists ?? {});
  return {
    monsters: monsters.length,
    monsterSpells: monsters.reduce((n, r) => n + (r.spells?.length ?? 0), 0),
    lists: lists.length,
    listSpells: lists.reduce((n, r) => n + (r.spells?.length ?? 0), 0),
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/normalise.test.mjs`
Expected: PASS, 12 tests. The parity test is the important one — it compares against all 378 real records.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-assign/manifest.mjs tests/normalise.test.mjs
git commit -m "Add the runtime manifest loader and name normaliser

normaliseName() is a port of spell_embed._norm(); a drift between them would
make every lookup miss silently, so the test checks the port against every
record in the real manifest."
```

---

### Task 6: The compendium pack tree

Pure tree construction, kept separate from the dialog so it can be tested without Foundry. It mirrors the compendium sidebar: folders (which nest) containing Item packs.

**Files:**
- Create: `scripts/auto-assign/tree.mjs`
- Create: `tests/tree.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `buildPackTree({folders, packs}) -> Node[]` where a folder node is
    `{type: "folder", id, name, children: Node[]}` and a pack node is
    `{type: "pack", id, name}`. Input `folders` are `{id, name, parentId}`,
    input `packs` are `{id, name, folderId}`. Folders sort before packs, each
    alphabetically by name. Folders containing no packs at any depth are omitted.
  - `selectedPackIds(nodes, checkedIds) -> string[]` — the ticked pack ids in tree order.
  - `nodeState(node, checkedIds) -> "checked"|"unchecked"|"indeterminate"` — a folder
    is `checked` when every descendant pack is ticked, `unchecked` when none is,
    `indeterminate` otherwise.
  - `packIdsUnder(node) -> string[]` — every pack id in a node's subtree, for
    tick-the-folder-ticks-the-subtree.

- [ ] **Step 1: Write the failing test**

Create `tests/tree.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackTree, selectedPackIds, nodeState, packIdsUnder }
  from "../scripts/auto-assign/tree.mjs";

const FIXTURE = {
  folders: [
    { id: "f1", name: "DBB Core Source", parentId: null },
    { id: "f2", name: "DBB Extra Source", parentId: null },
    { id: "f3", name: "Nested", parentId: "f1" },
    { id: "f4", name: "Empty", parentId: null },
  ],
  packs: [
    { id: "p.core.spells", name: "DBB Core Source Spells", folderId: "f1" },
    { id: "p.core.items", name: "DBB Core Source Items", folderId: "f1" },
    { id: "p.nested", name: "Nested Spells", folderId: "f3" },
    { id: "p.extra.spells", name: "DBB Extra Source Spells", folderId: "f2" },
    { id: "p.loose", name: "Loose Pack", folderId: null },
  ],
};

test("nests folders and puts loose packs at the root", () => {
  const tree = buildPackTree(FIXTURE);
  assert.deepEqual(tree.map(n => n.name),
    ["DBB Core Source", "DBB Extra Source", "Loose Pack"]);
  const core = tree[0];
  assert.deepEqual(core.children.map(n => n.name),
    ["Nested", "DBB Core Source Items", "DBB Core Source Spells"]);
  assert.equal(core.children[0].children[0].id, "p.nested");
});

test("omits folders with no packs at any depth", () => {
  const tree = buildPackTree(FIXTURE);
  assert.equal(tree.find(n => n.name === "Empty"), undefined);
});

test("keeps a folder whose only packs are in a subfolder", () => {
  const tree = buildPackTree({
    folders: [{ id: "a", name: "Outer", parentId: null },
              { id: "b", name: "Inner", parentId: "a" }],
    packs: [{ id: "p", name: "P", folderId: "b" }],
  });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].children[0].id, "p");
});

test("a folder pointing at a missing parent lands at the root", () => {
  const tree = buildPackTree({
    folders: [{ id: "orphan", name: "Orphan", parentId: "gone" }],
    packs: [{ id: "p", name: "P", folderId: "orphan" }],
  });
  assert.deepEqual(tree.map(n => n.name), ["Orphan"]);
});

test("packIdsUnder collects the whole subtree", () => {
  const tree = buildPackTree(FIXTURE);
  assert.deepEqual(packIdsUnder(tree[0]).sort(),
    ["p.core.items", "p.core.spells", "p.nested"]);
});

test("selectedPackIds returns ticked packs in tree order", () => {
  const tree = buildPackTree(FIXTURE);
  const checked = new Set(["p.loose", "p.nested", "p.core.spells"]);
  assert.deepEqual(selectedPackIds(tree, checked),
    ["p.nested", "p.core.spells", "p.loose"]);
});

test("a folder is checked only when every descendant pack is", () => {
  const tree = buildPackTree(FIXTURE);
  const core = tree[0];
  assert.equal(nodeState(core, new Set()), "unchecked");
  assert.equal(nodeState(core, new Set(["p.core.spells"])), "indeterminate");
  assert.equal(nodeState(core, new Set(packIdsUnder(core))), "checked");
});

test("a pack node reports its own state", () => {
  const tree = buildPackTree(FIXTURE);
  const loose = tree.find(n => n.id === "p.loose");
  assert.equal(nodeState(loose, new Set(["p.loose"])), "checked");
  assert.equal(nodeState(loose, new Set()), "unchecked");
});

test("a cyclic parent chain does not hang", () => {
  const tree = buildPackTree({
    folders: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }],
    packs: [{ id: "p", name: "P", folderId: "a" }],
  });
  assert.ok(Array.isArray(tree));
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/tree.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/auto-assign/tree.mjs`:

```javascript
/**
 * The compendium pack picker's tree, built to mirror the sidebar: nested
 * compendium folders holding packs. Kept pure and Foundry-free so it can be
 * tested; app.mjs is what reads game.packs / game.folders.
 */

/**
 * @param {{folders: {id, name, parentId}[], packs: {id, name, folderId}[]}} input
 * @returns {Array} folder and pack nodes, folders first, each alphabetical
 */
export function buildPackTree({ folders = [], packs = [] } = {}) {
  const byId = new Map();
  for ( const f of folders ) {
    byId.set(f.id, { type: "folder", id: f.id, name: f.name, parentId: f.parentId, children: [] });
  }

  // A parent that isn't in the set (or a cycle) would strand or loop the node,
  // so treat either as root-level.
  const parentOf = node => {
    if ( !node.parentId ) return null;
    const seen = new Set([node.id]);
    let p = byId.get(node.parentId);
    while ( p ) {
      if ( seen.has(p.id) ) return null;
      seen.add(p.id);
      if ( !p.parentId ) break;
      p = byId.get(p.parentId) ?? null;
      if ( !p ) return null;
    }
    return byId.get(node.parentId) ?? null;
  };

  const roots = [];
  for ( const node of byId.values() ) {
    const parent = parentOf(node);
    if ( parent ) parent.children.push(node);
    else roots.push(node);
  }

  for ( const p of packs ) {
    const node = { type: "pack", id: p.id, name: p.name };
    const parent = p.folderId ? byId.get(p.folderId) : null;
    if ( parent ) parent.children.push(node);
    else roots.push(node);
  }

  const byName = (a, b) => {
    if ( a.type !== b.type ) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  const prune = nodes => nodes
    .map(n => n.type === "folder" ? { ...n, children: prune(n.children) } : n)
    .filter(n => n.type === "pack" || n.children.length > 0)
    .sort(byName);

  return prune(roots);
}

/** Every pack id in this node's subtree. */
export function packIdsUnder(node) {
  if ( node.type === "pack" ) return [node.id];
  return node.children.flatMap(packIdsUnder);
}

/** Ticked pack ids, in tree order — which is the match-priority order. */
export function selectedPackIds(nodes, checkedIds) {
  const out = [];
  const walk = ns => {
    for ( const n of ns ) {
      if ( n.type === "pack" ) {
        if ( checkedIds.has(n.id) ) out.push(n.id);
      }
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** @returns {"checked"|"unchecked"|"indeterminate"} */
export function nodeState(node, checkedIds) {
  const ids = packIdsUnder(node);
  if ( !ids.length ) return "unchecked";
  const n = ids.filter(id => checkedIds.has(id)).length;
  if ( n === 0 ) return "unchecked";
  if ( n === ids.length ) return "checked";
  return "indeterminate";
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/tree.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-assign/tree.mjs tests/tree.test.mjs
git commit -m "Add the compendium pack tree for the picker

Pure and Foundry-free so it can be tested: nesting, pruning of folders with no
packs, tri-state folder checkboxes, and tree-order selection (which is the
match-priority order)."
```

---

### Task 7: The search index

**Files:**
- Create: `scripts/auto-assign/index.mjs`
- Create: `tests/index.test.mjs`

**Interfaces:**
- Consumes: `normaliseName` from Task 5.
- Produces:
  - `buildSearchIndex(packIds, {aliases, getPack}) -> Promise<{get(key), size, failed}>`
    - `get(key)` → `{uuid, name, packId, packLabel} | undefined`
    - `failed` → `[{packId, error: string}]`
    - `getPack` defaults to `id => game.packs.get(id)`; injected in tests. Evaluated at
      call time, so importing this module outside Foundry is safe.
    - Only `documentName === "Item"` packs are read, only entries with `type === "spell"`
      are indexed, and the **first** pack in `packIds` order to supply a key wins.

- [ ] **Step 1: Write the failing test**

Create `tests/index.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex } from "../scripts/auto-assign/index.mjs";

function fakePack(id, label, entries, { documentName = "Item", throws = null } = {}) {
  return {
    collection: id, metadata: { label }, documentName,
    async getIndex() {
      if ( throws ) throw new Error(throws);
      return entries.map(e => ({ _id: e.id, name: e.name, type: e.type ?? "spell",
                                 uuid: `Compendium.${id}.Item.${e.id}` }));
    },
  };
}

const packs = {
  "a.spells": fakePack("a.spells", "A Spells", [
    { id: "1", name: "Ice Knife" },
    { id: "2", name: "Shape Water" },
    { id: "3", name: "A Sword", type: "weapon" },
  ]),
  "b.spells": fakePack("b.spells", "B Spells", [
    { id: "9", name: "Ice Knife" },
    { id: "8", name: "Hex" },
  ]),
  "c.actors": fakePack("c.actors", "C Actors", [{ id: "7", name: "Ghoul" }],
    { documentName: "Actor" }),
  "d.broken": fakePack("d.broken", "D Broken", [], { throws: "index unavailable" }),
};
const getPack = id => packs[id];

test("indexes spells and skips non-spell items", async () => {
  const idx = await buildSearchIndex(["a.spells"], { getPack });
  assert.equal(idx.size, 2);
  assert.equal(idx.get("a sword"), undefined);
});

test("returns the uuid, name and source pack", async () => {
  const idx = await buildSearchIndex(["a.spells"], { getPack });
  assert.deepEqual(idx.get("ice knife"), {
    uuid: "Compendium.a.spells.Item.1", name: "Ice Knife",
    packId: "a.spells", packLabel: "A Spells",
  });
});

test("first pack in the given order wins", async () => {
  const first = await buildSearchIndex(["a.spells", "b.spells"], { getPack });
  assert.equal(first.get("ice knife").packId, "a.spells");
  const second = await buildSearchIndex(["b.spells", "a.spells"], { getPack });
  assert.equal(second.get("ice knife").packId, "b.spells");
});

test("skips packs that are not Item packs", async () => {
  const idx = await buildSearchIndex(["c.actors"], { getPack });
  assert.equal(idx.size, 0);
});

test("records a failing pack instead of throwing", async () => {
  const idx = await buildSearchIndex(["d.broken", "a.spells"], { getPack });
  assert.equal(idx.size, 2);
  assert.equal(idx.failed.length, 1);
  assert.equal(idx.failed[0].packId, "d.broken");
  assert.match(idx.failed[0].error, /index unavailable/);
});

test("records an unknown pack id", async () => {
  const idx = await buildSearchIndex(["nope"], { getPack });
  assert.equal(idx.failed[0].packId, "nope");
});

test("applies aliases when indexing", async () => {
  const idx = await buildSearchIndex(["b.spells"], {
    getPack, aliases: { hex: "hex curse" },
  });
  assert.ok(idx.get("hex curse"));
  assert.equal(idx.get("hex"), undefined);
});

test("reads only the packs it is given", async () => {
  const read = [];
  const spy = id => {
    read.push(id);
    return packs[id];
  };
  await buildSearchIndex(["a.spells"], { getPack: spy });
  assert.deepEqual(read, ["a.spells"]);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/index.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/auto-assign/index.mjs`:

```javascript
import { normaliseName } from "./manifest.mjs";

/**
 * Index the spells in the packs the GM ticked.
 *
 * Only the ticked packs are read, so a large collection costs nothing unless
 * it is selected. The first pack in `packIds` order to supply a name wins,
 * which makes the picker's tree order the match-priority order.
 *
 * @param {string[]} packIds
 * @param {object}   options
 * @param {object}   [options.aliases]
 * @param {Function} [options.getPack]   injected for tests
 * @param {Function} [options.onProgress] called with (done, total, packLabel)
 * @returns {Promise<{get: Function, size: number, failed: {packId, error}[]}>}
 */
export async function buildSearchIndex(packIds, {
  aliases = {},
  getPack = id => game.packs.get(id),
  onProgress = null,
} = {}) {
  const map = new Map();
  const failed = [];
  let done = 0;

  for ( const packId of packIds ) {
    const pack = getPack(packId);
    // Every path out of this loop body must reach the `finally`, including the
    // unresolvable-pack one -- a caller driving a progress bar off (done, total)
    // would otherwise stall and never see done === total when a ticked
    // compendium has gone missing since the picker was built.
    let label = packId;
    try {
      if ( !pack ) {
        failed.push({ packId, error: "compendium not found" });
        continue;
      }
      label = pack.metadata?.label ?? packId;
      if ( pack.documentName !== "Item" ) continue;
      const entries = await pack.getIndex({ fields: ["type"] });
      for ( const e of entries ) {
        if ( e.type !== "spell" ) continue;
        const key = normaliseName(e.name, aliases);
        if ( !key || map.has(key) ) continue;   // first pack wins
        map.set(key, {
          uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`,
          name: e.name, packId, packLabel: label,
        });
      }
    }
    catch ( err ) {
      failed.push({ packId, error: err.message ?? String(err) });
    }
    finally {
      done++;
      onProgress?.(done, packIds.length, label);
    }
  }

  return { get: key => map.get(key), size: map.size, failed };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/index.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-assign/index.mjs tests/index.test.mjs
git commit -m "Add the compendium spell search index

Lazy: only ticked packs are read. First pack in tree order wins a name, so the
picker's ordering is the match-priority order, and a pack that fails to index
is recorded rather than aborting the run."
```

---

### Task 8: The planner

The heart of the tool, and the reason the earlier tasks kept everything pure: this decides every write, and it must be provably additive and idempotent.

**Files:**
- Create: `scripts/auto-assign/plan.mjs`
- Create: `tests/plan.test.mjs`

**Interfaces:**
- Consumes: manifest shape from Task 5, index shape from Task 7.
- Produces:
  - `TARGETS = {MONSTERS: "monsters", LISTS: "spellLists"}`
  - `DESTINATIONS = {BOTH: "both", COMPENDIUM: "compendium", WORLD: "world"}`
  - `listsAvailable(destination) -> boolean` — false for `WORLD`; spell lists exist
    only in the compendium.
  - `buildPlan({manifest, index, targets, destination, state}) -> Plan`
    - `state` is `{monsters: MonsterState[], lists: ListState[]}` gathered by Task 9:
      - `MonsterState` = `{id, name, scope: "pack"|"world", uuid, haveKeys: Set<string>}`
      - `ListState` = `{pageKey, name, uuid, haveUuids: Set<string>}`
    - `Plan` = `{writes: Write[], notFound: NotFound[], counts: {spells, monsters, listEntries, lists, notFound}}`
      - `MonsterWrite` = `{kind: "monster", uuid, targetName, scope, spells: [{name, key, prep, perDay, match}]}`
      - `ListWrite` = `{kind: "list", uuid, targetName, spells: [{name, key, match}]}`
      - `NotFound` = `{name, key, wantedBy: string[]}` sorted by `key`

- [ ] **Step 1: Write the failing test**

Create `tests/plan.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, listsAvailable, TARGETS, DESTINATIONS }
  from "../scripts/auto-assign/plan.mjs";

const MANIFEST = {
  aliases: {},
  monsters: {
    m1: { name: "Frost Revenant", pack: "monsters", spells: [
      { name: "Ice Knife", key: "ice knife", prep: "prepared", level: 1, perDay: null },
      { name: "Shape Water", key: "shape water", prep: "atwill", level: 0, perDay: null },
    ] },
    m2: { name: "Fel Imp", pack: "monsters", spells: [
      { name: "Hex", key: "hex", prep: "innate", level: 1, perDay: 2 },
    ] },
  },
  spellLists: {
    "j.p1": { name: "Mage Spells", identifier: "wc5e-mage", pack: "spell-lists", spells: [
      { name: "Synaptic Static", key: "synaptic static", source: "XGE" },
      { name: "Ice Knife", key: "ice knife", source: "XGE" },
    ] },
  },
};

const MATCHES = {
  "ice knife": { uuid: "Compendium.x.Item.1", name: "Ice Knife", packId: "x", packLabel: "X" },
  "hex": { uuid: "Compendium.x.Item.2", name: "Hex", packId: "x", packLabel: "X" },
};
const index = { get: k => MATCHES[k], size: 2, failed: [] };

function state({ have = {}, listHave = [], scopes = { m1: "pack", m2: "pack" } } = {}) {
  return {
    monsters: Object.keys(MANIFEST.monsters).map(id => ({
      id, name: MANIFEST.monsters[id].name, scope: scopes[id],
      uuid: `Compendium.wc5e-foundryvtt.monsters.Actor.${id}`,
      haveKeys: new Set(have[id] ?? []),
    })),
    lists: [{ pageKey: "j.p1", name: "Mage Spells",
              uuid: "Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.j.JournalEntryPage.p1",
              haveUuids: new Set(listHave) }],
  };
}

const ALL = [TARGETS.MONSTERS, TARGETS.LISTS];

test("plans the matches it found and reports the rest", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  assert.equal(p.counts.spells, 2);        // ice knife on m1, hex on m2
  assert.equal(p.counts.monsters, 2);
  assert.equal(p.counts.listEntries, 1);   // ice knife on the mage list
  assert.deepEqual(p.notFound.map(n => n.key), ["shape water", "synaptic static"]);
});

test("not-found records name who wanted them", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  const sw = p.notFound.find(n => n.key === "shape water");
  assert.deepEqual(sw.wantedBy, ["Frost Revenant"]);
  assert.equal(sw.name, "Shape Water");
});

test("not-found carries the source book when a record has one", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  assert.equal(p.notFound.find(n => n.key === "synaptic static").source, "XGE");
  assert.equal(p.notFound.find(n => n.key === "shape water").source, "");
});

test("carries preparation mode and per-day uses onto the write", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: state() });
  const imp = p.writes.find(w => w.targetName === "Fel Imp");
  assert.equal(imp.spells[0].prep, "innate");
  assert.equal(imp.spells[0].perDay, 2);
  assert.equal(imp.spells[0].match.uuid, "Compendium.x.Item.2");
});

test("skips a spell the monster already has", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ have: { m1: ["ice knife"] } }) });
  assert.equal(p.counts.spells, 1);
  assert.equal(p.writes.find(w => w.targetName === "Frost Revenant"), undefined);
});

test("skips a list entry that already points at that spell", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH,
                        state: state({ listHave: ["Compendium.x.Item.1"] }) });
  assert.equal(p.counts.listEntries, 0);
});

test("a fully satisfied plan is empty — the second run adds nothing", () => {
  const p = buildPlan({
    manifest: MANIFEST, index, targets: ALL, destination: DESTINATIONS.BOTH,
    state: state({ have: { m1: ["ice knife"], m2: ["hex"] },
                   listHave: ["Compendium.x.Item.1"] }),
  });
  assert.equal(p.writes.length, 0);
  assert.equal(p.counts.spells, 0);
  assert.equal(p.counts.listEntries, 0);
});

test("still reports not-found on a second run", () => {
  const p = buildPlan({
    manifest: MANIFEST, index, targets: ALL, destination: DESTINATIONS.BOTH,
    state: state({ have: { m1: ["ice knife"], m2: ["hex"] },
                   listHave: ["Compendium.x.Item.1"] }),
  });
  assert.equal(p.counts.notFound, 2);
});

test("monsters-only target skips the lists", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: [TARGETS.MONSTERS],
                        destination: DESTINATIONS.BOTH, state: state() });
  assert.equal(p.counts.listEntries, 0);
  assert.ok(!p.notFound.some(n => n.key === "synaptic static"));
});

test("lists-only target skips the monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: [TARGETS.LISTS],
                        destination: DESTINATIONS.BOTH, state: state() });
  assert.equal(p.counts.spells, 0);
  assert.equal(p.counts.listEntries, 1);
});

test("world destination writes no list entries — lists exist only in the compendium", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.WORLD,
                        state: state({ scopes: { m1: "world", m2: "world" } }) });
  assert.equal(p.counts.listEntries, 0);
  assert.equal(p.counts.spells, 2);
});

test("listsAvailable is false only for the world destination", () => {
  assert.equal(listsAvailable(DESTINATIONS.WORLD), false);
  assert.equal(listsAvailable(DESTINATIONS.BOTH), true);
  assert.equal(listsAvailable(DESTINATIONS.COMPENDIUM), true);
});

test("compendium destination skips world-scoped monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.COMPENDIUM,
                        state: state({ scopes: { m1: "world", m2: "pack" } }) });
  assert.deepEqual(p.writes.filter(w => w.kind === "monster").map(w => w.targetName),
    ["Fel Imp"]);
});

test("world destination skips pack-scoped monsters", () => {
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.WORLD,
                        state: state({ scopes: { m1: "world", m2: "pack" } }) });
  assert.deepEqual(p.writes.filter(w => w.kind === "monster").map(w => w.targetName),
    ["Frost Revenant"]);
});

test("a monster in the manifest but absent from state is ignored", () => {
  const s = state();
  s.monsters = s.monsters.filter(m => m.id === "m1");
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: s });
  assert.equal(p.writes.filter(w => w.kind === "monster").length, 1);
});

test("the same monster imported twice gets one write each", () => {
  const s = state();
  s.monsters.push({ id: "m1", name: "Frost Revenant", scope: "world",
                    uuid: "Actor.copy", haveKeys: new Set() });
  const p = buildPlan({ manifest: MANIFEST, index, targets: ALL,
                        destination: DESTINATIONS.BOTH, state: s });
  assert.equal(p.writes.filter(w => w.targetName === "Frost Revenant").length, 2);
  assert.equal(p.counts.spells, 3);
});

test("an empty index puts everything in not-found and plans nothing", () => {
  const p = buildPlan({ manifest: MANIFEST, index: { get: () => undefined, size: 0, failed: [] },
                        targets: ALL, destination: DESTINATIONS.BOTH, state: state() });
  assert.equal(p.writes.length, 0);
  assert.equal(p.counts.notFound, 4);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/plan.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/auto-assign/plan.mjs`:

```javascript
/**
 * Decide every write, and nothing else. Pure so the preview the GM approves is
 * exactly what apply.mjs executes, and so the additive/idempotent guarantee is
 * testable without Foundry.
 */

export const TARGETS = { MONSTERS: "monsters", LISTS: "spellLists" };
export const DESTINATIONS = { BOTH: "both", COMPENDIUM: "compendium", WORLD: "world" };

/** Spell lists live only in the compendium; there is no world-side copy. */
export function listsAvailable(destination) {
  return destination !== DESTINATIONS.WORLD;
}

function wantsScope(destination, scope) {
  if ( destination === DESTINATIONS.BOTH ) return true;
  if ( destination === DESTINATIONS.COMPENDIUM ) return scope === "pack";
  return scope === "world";
}

/**
 * @param {object} manifest      from loadManifest()
 * @param {object} index         from buildSearchIndex()
 * @param {string[]} targets     TARGETS values
 * @param {string} destination   a DESTINATIONS value
 * @param {object} state         {monsters: MonsterState[], lists: ListState[]}
 * @returns {object} plan
 */
export function buildPlan({ manifest, index, targets, destination, state }) {
  const writes = [];
  const notFound = new Map();

  const miss = (spell, who) => {
    const rec = notFound.get(spell.key)
      ?? { name: spell.name, key: spell.key, source: spell.source ?? "", wantedBy: [] };
    // Monster records carry no source book; a list record for the same spell
    // usually does, so keep the first non-empty one we see.
    if ( !rec.source && spell.source ) rec.source = spell.source;
    if ( !rec.wantedBy.includes(who) ) rec.wantedBy.push(who);
    notFound.set(spell.key, rec);
  };

  if ( targets.includes(TARGETS.MONSTERS) ) {
    for ( const mon of state.monsters ) {
      const record = manifest.monsters[mon.id];
      if ( !record ) continue;
      const spells = [];
      for ( const s of record.spells ) {
        const match = index.get(s.key);
        if ( !match ) {
          miss(s, mon.name);
          continue;
        }
        if ( mon.haveKeys.has(s.key) ) continue;   // additive only
        if ( !wantsScope(destination, mon.scope) ) continue;
        spells.push({ name: s.name, key: s.key, prep: s.prep, perDay: s.perDay ?? null, match });
      }
      if ( spells.length ) {
        writes.push({ kind: "monster", uuid: mon.uuid, targetName: mon.name,
                      scope: mon.scope, spells });
      }
    }
  }

  if ( targets.includes(TARGETS.LISTS) && listsAvailable(destination) ) {
    for ( const list of state.lists ) {
      const record = manifest.spellLists[list.pageKey];
      if ( !record ) continue;
      const spells = [];
      for ( const s of record.spells ) {
        const match = index.get(s.key);
        if ( !match ) {
          miss(s, list.name);
          continue;
        }
        if ( list.haveUuids.has(match.uuid) ) continue;
        spells.push({ name: s.name, key: s.key, match });
      }
      if ( spells.length ) {
        writes.push({ kind: "list", uuid: list.uuid, targetName: list.name, spells });
      }
    }
  }

  const monsterWrites = writes.filter(w => w.kind === "monster");
  const listWrites = writes.filter(w => w.kind === "list");
  return {
    writes,
    notFound: [...notFound.values()].sort((a, b) => a.key.localeCompare(b.key)),
    counts: {
      spells: monsterWrites.reduce((n, w) => n + w.spells.length, 0),
      monsters: monsterWrites.length,
      listEntries: listWrites.reduce((n, w) => n + w.spells.length, 0),
      lists: listWrites.length,
      notFound: notFound.size,
    },
  };
}
```

Note the ordering inside the monster loop: a spell that was *not found* is reported even when the monster already has it or the scope is excluded, because the GM still wants to know the name is unavailable. A spell that *was* found but is already present is silently skipped — that is what makes the second run empty.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/plan.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-assign/plan.mjs tests/plan.test.mjs
git commit -m "Add the auto-assign planner

Pure, so the preview the GM approves is exactly what gets applied. Tests cover
the guarantees that matter: additive-only, a second run plans nothing, and
spell lists are skipped for the world-only destination because no world copy
exists."
```

---

### Task 9: Gather state and apply a plan

**Files:**
- Create: `scripts/auto-assign/apply.mjs`
- Create: `tests/apply.test.mjs`

**Interfaces:**
- Consumes: `TARGETS`, `DESTINATIONS`, `listsAvailable` from Task 8; `normaliseName` from Task 5.
- Produces:
  - `MODULE_ID = "wc5e-foundryvtt"`
  - `collectState({manifest, targets, destination, deps}) -> Promise<{monsters, lists}>` in the
    shape Task 8's `buildPlan` expects. `deps` defaults to live Foundry accessors and is
    injected in tests: `{getPack, getWorldActors}`.
  - `spellItemData(sourceDoc, {prep, perDay}) -> object` — the embedded item payload.
  - `applyPlan(plan, {deps}) -> Promise<{added, entriesAdded, failures: {target, error}[]}>`
    - Unlocks every pack the plan touches **before writing anything**, and throws if one
      refuses — otherwise every single write to that pack fails identically and the report
      is 60 rows of the same error. Re-locks in a `finally` so a mid-run throw cannot leave
      a pack unlocked.

- [ ] **Step 1: Write the failing test**

Create `tests/apply.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { spellItemData, applyPlan, collectState, MODULE_ID }
  from "../scripts/auto-assign/apply.mjs";
import { TARGETS, DESTINATIONS } from "../scripts/auto-assign/plan.mjs";

const SOURCE = {
  toObject: () => ({ _id: "src1", name: "Hex", type: "spell",
                     system: { level: 1, preparation: { mode: "prepared", prepared: false } } }),
};

test("spellItemData strips the source id and sets the preparation mode", () => {
  const d = spellItemData(SOURCE, { prep: "atwill", perDay: null });
  assert.equal(d._id, undefined);
  assert.equal(d.system.preparation.mode, "atwill");
  assert.equal(d.system.preparation.prepared, false);
});

test("spellItemData marks prepared spells prepared", () => {
  const d = spellItemData(SOURCE, { prep: "prepared", perDay: null });
  assert.equal(d.system.preparation.prepared, true);
});

test("spellItemData sets per-day uses for innate casting", () => {
  const d = spellItemData(SOURCE, { prep: "innate", perDay: 2 });
  assert.deepEqual(d.system.uses,
    { max: "2", spent: 0, recovery: [{ period: "day", type: "recoverAll" }] });
});

test("spellItemData leaves uses alone when there is no per-day count", () => {
  const d = spellItemData(SOURCE, { prep: "atwill", perDay: null });
  assert.equal(d.system.uses, undefined);
});

function fakeActor(id) {
  return { id, created: [], async createEmbeddedDocuments(_t, data) {
    this.created.push(...data); return data;
  } };
}

function harness({ locked = true, failOn = null } = {}) {
  const actor = fakeActor("m1");
  const page = { uuid: "page1", system: { spells: ["Compendium.x.Item.old"] },
                 updates: [], async update(d) { this.updates.push(d); } };
  const pack = {
    collection: `${MODULE_ID}.monsters`, locked,
    configured: [],
    async configure(c) { this.configured.push(c); this.locked = c.locked ?? this.locked; },
    async getDocument() { return actor; },
  };
  const deps = {
    getPack: () => pack,
    resolveUuid: async uuid => {
      if ( failOn && uuid === failOn ) throw new Error("boom");
      if ( uuid === "page1" ) return page;
      if ( uuid.startsWith("Compendium.wc5e-foundryvtt.monsters")) return actor;
      return SOURCE;
    },
  };
  return { actor, page, pack, deps };
}

const MONSTER_WRITE = {
  kind: "monster", uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m1",
  targetName: "Fel Imp", scope: "pack",
  spells: [{ name: "Hex", key: "hex", prep: "innate", perDay: 2,
             match: { uuid: "Compendium.x.Item.2" } }],
};

test("creates the embedded spell on the target actor", async () => {
  const h = harness();
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  assert.equal(res.added, 1);
  assert.equal(h.actor.created[0].name, "Hex");
  assert.equal(h.actor.created[0].system.preparation.mode, "innate");
});

test("unlocks a locked pack and re-locks it afterwards", async () => {
  const h = harness({ locked: true });
  await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  assert.deepEqual(h.pack.configured, [{ locked: false }, { locked: true }]);
});

test("leaves an already-unlocked pack unlocked", async () => {
  const h = harness({ locked: false });
  await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  assert.deepEqual(h.pack.configured, []);
});

test("re-locks even when a write throws", async () => {
  const h = harness({ locked: true, failOn: "Compendium.x.Item.2" });
  const res = await applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps });
  assert.deepEqual(h.pack.configured, [{ locked: false }, { locked: true }]);
  assert.equal(res.failures.length, 1);
  assert.equal(res.added, 0);
});

test("aborts without writing when a pack cannot be unlocked", async () => {
  const h = harness({ locked: true });
  h.pack.configure = async c => {
    if ( c.locked === false ) throw new Error("permission denied");
  };
  await assert.rejects(() => applyPlan({ writes: [MONSTER_WRITE] }, { deps: h.deps }),
    /Could not unlock .*permission denied/);
  assert.equal(h.actor.created.length, 0);
});

test("appends to a spell list without dropping what is already there", async () => {
  const h = harness();
  const write = { kind: "list", uuid: "page1", targetName: "Mage Spells",
                  spells: [{ name: "Hex", key: "hex", match: { uuid: "Compendium.x.Item.2" } }] };
  const res = await applyPlan({ writes: [write] }, { deps: h.deps });
  assert.equal(res.entriesAdded, 1);
  assert.deepEqual(h.page.updates[0]["system.spells"].sort(),
    ["Compendium.x.Item.2", "Compendium.x.Item.old"]);
});

test("a failure on one write does not stop the others", async () => {
  const h = harness({ failOn: "Compendium.x.Item.2" });
  const ok = { ...MONSTER_WRITE, spells: [{ name: "Ice Knife", key: "ice knife",
    prep: "prepared", perDay: null, match: { uuid: "Compendium.x.Item.1" } }] };
  const res = await applyPlan({ writes: [MONSTER_WRITE, ok] }, { deps: h.deps });
  assert.equal(res.added, 1);
  assert.equal(res.failures.length, 1);
});

test("collectState reads existing spell names off the actor", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const packActor = { id: "m1", uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m1",
                      items: [{ type: "spell", name: "Hex" }, { type: "weapon", name: "Claw" }] };
  const deps = {
    getPack: () => ({ collection: `${MODULE_ID}.monsters`,
                      async getDocuments() { return [packActor]; } }),
    getWorldActors: () => [],
  };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.COMPENDIUM, deps });
  assert.equal(s.monsters.length, 1);
  assert.ok(s.monsters[0].haveKeys.has("hex"));
  assert.ok(!s.monsters[0].haveKeys.has("claw"));
});

test("collectState finds world actors imported from our pack", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const worldActor = { id: "w1", uuid: "Actor.w1", items: [],
                       _stats: { compendiumSource: "Compendium.wc5e-foundryvtt.monsters.Actor.m1" } };
  const deps = { getPack: () => ({ async getDocuments() { return []; } }),
                 getWorldActors: () => [worldActor] };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.WORLD, deps });
  assert.equal(s.monsters[0].id, "m1");
  assert.equal(s.monsters[0].scope, "world");
  assert.equal(s.monsters[0].uuid, "Actor.w1");
});

test("collectState falls back to the legacy sourceId flag", async () => {
  const manifest = { monsters: { m1: { name: "Fel Imp", pack: "monsters", spells: [] } },
                     spellLists: {}, aliases: {} };
  const legacy = { id: "w2", uuid: "Actor.w2", items: [], _stats: {},
                   flags: { core: { sourceId: "Compendium.wc5e-foundryvtt.monsters.Actor.m1" } } };
  const deps = { getPack: () => ({ async getDocuments() { return []; } }),
                 getWorldActors: () => [legacy] };
  const s = await collectState({ manifest, targets: [TARGETS.MONSTERS],
                                 destination: DESTINATIONS.WORLD, deps });
  assert.equal(s.monsters.length, 1);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/apply.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/auto-assign/apply.mjs`:

```javascript
import { normaliseName } from "./manifest.mjs";
import { TARGETS, DESTINATIONS, listsAvailable } from "./plan.mjs";

export const MODULE_ID = "wc5e-foundryvtt";

const liveDeps = () => ({
  getPack: id => game.packs.get(id),
  getWorldActors: () => game.actors.contents,
  resolveUuid: uuid => fromUuid(uuid),
});

/**
 * The embedded item payload for a spell found in the GM's own compendium.
 * Mirrors what spell_embed._embed_item() does at build time.
 */
export function spellItemData(sourceDoc, { prep, perDay }) {
  const data = sourceDoc.toObject();
  delete data._id;
  data.system = data.system ?? {};
  data.system.preparation = { mode: prep, prepared: prep === "prepared" };
  if ( prep === "innate" && perDay ) {
    data.system.uses = { max: String(perDay), spent: 0,
                         recovery: [{ period: "day", type: "recoverAll" }] };
  }
  return data;
}

function sourceIdOf(actor) {
  return actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? null;
}

/**
 * Gather what already exists, so the planner can be additive.
 * @returns {Promise<{monsters: object[], lists: object[]}>}
 */
export async function collectState({ manifest, targets, destination, deps = liveDeps() }) {
  const monsters = [];
  const lists = [];

  if ( targets.includes(TARGETS.MONSTERS) ) {
    const wantPack = destination !== DESTINATIONS.WORLD;
    const wantWorld = destination !== DESTINATIONS.COMPENDIUM;

    if ( wantPack ) {
      const pack = deps.getPack(`${MODULE_ID}.monsters`);
      const docs = pack ? await pack.getDocuments() : [];
      for ( const actor of docs ) {
        if ( !manifest.monsters[actor.id] ) continue;
        monsters.push({
          id: actor.id, name: actor.name ?? manifest.monsters[actor.id].name,
          scope: "pack", uuid: actor.uuid, haveKeys: spellKeys(actor, manifest.aliases),
        });
      }
    }

    if ( wantWorld ) {
      const prefix = `Compendium.${MODULE_ID}.monsters.Actor.`;
      for ( const actor of deps.getWorldActors() ) {
        const src = sourceIdOf(actor);
        if ( !src?.startsWith(prefix) ) continue;
        const id = src.slice(prefix.length);
        if ( !manifest.monsters[id] ) continue;
        monsters.push({
          id, name: actor.name ?? manifest.monsters[id].name,
          scope: "world", uuid: actor.uuid, haveKeys: spellKeys(actor, manifest.aliases),
        });
      }
    }
  }

  if ( targets.includes(TARGETS.LISTS) && listsAvailable(destination) ) {
    const pack = deps.getPack(`${MODULE_ID}.spell-lists`);
    const journals = pack ? await pack.getDocuments() : [];
    for ( const journal of journals ) {
      for ( const page of journal.pages ?? [] ) {
        const key = `${journal.id}.${page.id}`;
        if ( !manifest.spellLists[key] ) continue;
        lists.push({
          pageKey: key, name: page.name, uuid: page.uuid,
          haveUuids: new Set(page.system?.spells ?? []),
        });
      }
    }
  }

  return { monsters, lists };
}

function spellKeys(actor, aliases) {
  const keys = new Set();
  for ( const item of actor.items ?? [] ) {
    if ( item.type === "spell" ) keys.add(normaliseName(item.name, aliases));
  }
  return keys;
}

/**
 * Execute a plan. Additive only: every write is a create or an append.
 * @returns {Promise<{added: number, entriesAdded: number, failures: object[]}>}
 */
export async function applyPlan(plan, { deps = liveDeps(), onProgress = null } = {}) {
  const failures = [];
  let added = 0;
  let entriesAdded = 0;
  const unlocked = new Map();

  // Unlock everything up front. If a pack refuses, abort before writing
  // anything -- otherwise every write to it fails identically and the report
  // becomes dozens of rows of the same error.
  const packIds = new Set();
  for ( const write of plan.writes ) {
    const m = /^Compendium\.([^.]+\.[^.]+)\./.exec(write.uuid);
    if ( m ) packIds.add(m[1]);
  }
  for ( const packId of packIds ) {
    const pack = deps.getPack(packId);
    if ( !pack || !pack.locked ) continue;
    try {
      await pack.configure({ locked: false });
      unlocked.set(packId, pack);
    }
    catch ( err ) {
      for ( const p of unlocked.values() ) await p.configure({ locked: true }).catch(() => {});
      throw new Error(`Could not unlock ${packId}: ${err.message ?? err}`);
    }
  }

  try {
    let done = 0;
    for ( const write of plan.writes ) {
      try {
        const target = await deps.resolveUuid(write.uuid);
        if ( !target ) throw new Error("target document not found");

        if ( write.kind === "monster" ) {
          const data = [];
          for ( const s of write.spells ) {
            const src = await deps.resolveUuid(s.match.uuid);
            if ( !src ) throw new Error(`spell not found: ${s.name}`);
            data.push(spellItemData(src, s));
          }
          await target.createEmbeddedDocuments("Item", data);
          added += data.length;
        }
        else {
          const have = new Set(target.system?.spells ?? []);
          for ( const s of write.spells ) have.add(s.match.uuid);
          await target.update({ "system.spells": [...have] });
          entriesAdded += write.spells.length;
        }
      }
      catch ( err ) {
        failures.push({ target: write.targetName, error: err.message ?? String(err) });
      }
      finally {
        onProgress?.(++done, plan.writes.length, write.targetName);
      }
    }
  }
  finally {
    // Re-lock whatever we unlocked, even if the run threw. Leaving a module
    // pack unlocked invites accidental edits that a module update then wipes.
    for ( const pack of unlocked.values() ) {
      try { await pack.configure({ locked: true }); }
      catch { /* nothing useful to do; the report already reflects the writes */ }
    }
  }

  return { added, entriesAdded, failures };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/apply.test.mjs`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 11 Python tests and 60 node tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/auto-assign/apply.mjs tests/apply.test.mjs
git commit -m "Gather compendium/world state and apply an auto-assign plan

Unlocks a locked module pack and re-locks it in a finally, so a mid-run throw
cannot leave it open. One failed write is recorded and the rest continue."
```

---

### Task 10: The dialog

**Files:**
- Create: `scripts/auto-assign/app.mjs`
- Create: `templates/auto-assign/configure.hbs`
- Create: `templates/auto-assign/preview.hbs`
- Create: `templates/auto-assign/report.hbs`

**Interfaces:**
- Consumes: everything from Tasks 5–9.
- Produces: `class AutoAssignApp` with `static show()`, and `AutoAssignApp.settingKeys`
  re-exported for Task 11.

This task is Foundry-coupled and cannot be unit-tested headlessly; it is covered by the manual checklist in Task 12.

- [ ] **Step 1: Write the configure template**

Create `templates/auto-assign/configure.hbs`:

```handlebars
<section class="wc5e-aa-configure">
  <p class="notes">{{localize "WC5E.AutoAssign.Intro"}}</p>

  <fieldset>
    <legend>{{localize "WC5E.AutoAssign.TargetsLegend"}}</legend>
    <label class="checkbox">
      <input type="checkbox" name="target-monsters" {{checked targets.monsters}}>
      {{localize "WC5E.AutoAssign.TargetMonsters"}}
      <span class="notes">({{totals.monsters}} / {{totals.monsterSpells}})</span>
    </label>
    <label class="checkbox {{#unless listsAvailable}}disabled{{/unless}}">
      <input type="checkbox" name="target-lists" {{checked targets.lists}}
             {{disabled (wc5eNot listsAvailable)}}>
      {{localize "WC5E.AutoAssign.TargetLists"}}
      <span class="notes">({{totals.lists}} / {{totals.listSpells}})</span>
    </label>
    {{#unless listsAvailable}}
      <p class="notes hint">{{localize "WC5E.AutoAssign.ListsNeedCompendium"}}</p>
    {{/unless}}
  </fieldset>

  <fieldset>
    <legend>{{localize "WC5E.AutoAssign.DestinationLegend"}}</legend>
    <select name="destination">
      {{#each destinations}}
        <option value="{{this.value}}" {{selected this.chosen}}>{{this.label}}</option>
      {{/each}}
    </select>
    <p class="notes hint">{{localize "WC5E.AutoAssign.UpdateCaveat"}}</p>
  </fieldset>

  <fieldset>
    <legend>{{localize "WC5E.AutoAssign.SearchLegend"}}</legend>
    <p class="notes">{{localize "WC5E.AutoAssign.SearchHint"}}</p>
    <ol class="wc5e-aa-tree">{{> wc5eAutoAssignNodes nodes=tree}}</ol>
  </fieldset>
</section>
```

Create the partial `templates/auto-assign/nodes.hbs`:

```handlebars
{{#each nodes}}
  <li class="wc5e-aa-node {{this.type}}" data-node-id="{{this.id}}">
    <label class="checkbox">
      {{#if (wc5eEq this.type "folder")}}
        <a class="wc5e-aa-toggle" data-node-id="{{this.id}}">
          <i class="fa-solid {{#if this.expanded}}fa-folder-open{{else}}fa-folder{{/if}}"></i>
        </a>
      {{/if}}
      <input type="checkbox" class="wc5e-aa-check" data-node-id="{{this.id}}"
             {{checked (wc5eEq this.state "checked")}}>
      {{this.name}}
    </label>
    {{#if (wc5eAnd (wc5eEq this.type "folder") this.expanded)}}
      <ol>{{> wc5eAutoAssignNodes nodes=this.children}}</ol>
    {{/if}}
  </li>
{{/each}}
```

- [ ] **Step 2: Write the preview and report templates**

Create `templates/auto-assign/preview.hbs`:

```handlebars
<section class="wc5e-aa-preview">
  <p>{{localize "WC5E.AutoAssign.PreviewSummary" spells=counts.spells monsters=counts.monsters
        entries=counts.listEntries lists=counts.lists}}</p>
  {{#if counts.notFound}}
    <p class="notes">{{localize "WC5E.AutoAssign.PreviewNotFound" count=counts.notFound}}</p>
  {{/if}}
  {{#if indexFailures.length}}
    <p class="notification warning">
      {{localize "WC5E.AutoAssign.IndexFailures"}}
      {{#each indexFailures}}<br>{{this.packId}}: {{this.error}}{{/each}}
    </p>
  {{/if}}
  <ol class="wc5e-aa-writes">
    {{#each writes}}
      <li><strong>{{this.targetName}}</strong>
        <span class="notes">{{this.scopeLabel}}</span>
        <ul>{{#each this.spells}}
          <li>{{this.name}} <span class="notes">{{this.match.packLabel}}</span></li>
        {{/each}}</ul>
      </li>
    {{/each}}
  </ol>
</section>
```

Create `templates/auto-assign/report.hbs`:

```handlebars
<section class="wc5e-aa-report">
  <p>{{localize "WC5E.AutoAssign.ReportSummary" added=result.added entries=result.entriesAdded}}</p>
  {{#if result.failures.length}}
    <p class="notification error">{{localize "WC5E.AutoAssign.ReportFailures"}}</p>
    <ul>{{#each result.failures}}<li>{{this.target}}: {{this.error}}</li>{{/each}}</ul>
  {{/if}}
  {{#if notFoundCount}}
    <h3>{{localize "WC5E.AutoAssign.NotFoundHeading" count=notFoundCount}}</h3>
    <p class="notes">{{localize "WC5E.AutoAssign.NotFoundHint"}}</p>
    {{#each notFoundGroups}}
      <h4>{{this.label}}</h4>
      <ul class="wc5e-aa-notfound">
        {{#each this.spells}}
          <li>{{this.name}} <span class="notes">{{this.wantedByLabel}}</span></li>
        {{/each}}
      </ul>
    {{/each}}
    <button type="button" data-action="copy">
      <i class="fa-solid fa-copy"></i> {{localize "WC5E.AutoAssign.CopyList"}}
    </button>
  {{/if}}
  <p class="notes hint">{{localize "WC5E.AutoAssign.UpdateCaveat"}}</p>
</section>
```

- [ ] **Step 3: Write the application**

Create `scripts/auto-assign/app.mjs`:

```javascript
import { loadManifest, manifestTotals } from "./manifest.mjs";
import { buildPackTree, packIdsUnder, selectedPackIds, nodeState } from "./tree.mjs";
import { buildSearchIndex } from "./index.mjs";
import { buildPlan, listsAvailable, TARGETS, DESTINATIONS } from "./plan.mjs";
import { collectState, applyPlan, MODULE_ID } from "./apply.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const SETTINGS = {
  packs: "autoAssign.searchPacks",
  targets: "autoAssign.targets",
  destination: "autoAssign.destination",
  dismissed: "autoAssign.promptDismissed",
  promptedVersion: "autoAssign.lastPromptedVersion",
};

export class AutoAssignApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "wc5e-auto-assign",
    tag: "form",
    window: { title: "WC5E.AutoAssign.Title", icon: "fa-solid fa-wand-magic-sparkles",
              resizable: true },
    position: { width: 640, height: 720 },
    actions: {
      scan: AutoAssignApp.#onScan,
      apply: AutoAssignApp.#onApply,
      back: AutoAssignApp.#onBack,
      copy: AutoAssignApp.#onCopy,
    },
  };

  static PARTS = {
    body: { template: "modules/wc5e-foundryvtt/templates/auto-assign/configure.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  /** @type {"configure"|"preview"|"report"} */
  #stage = "configure";
  #manifest = null;
  #tree = [];
  #checked = new Set();
  #expanded = new Set();
  #plan = null;
  #indexFailures = [];
  #result = null;
  #busy = false;

  static async show() {
    const app = new AutoAssignApp();
    await app.render(true);
    return app;
  }

  /**
   * ApplicationV2 awaits this before the first render, which is what lets the
   * settings menu instantiate this class directly instead of needing a shim.
   */
  async _preFirstRender(context, options) {
    await super._preFirstRender(context, options);
    try {
      await this.#init();
    }
    catch ( err ) {
      console.error("wc5e-foundryvtt | could not open auto-assign", err);
      ui.notifications.error(game.i18n.format("WC5E.AutoAssign.LoadFailed",
        { error: err.message ?? String(err) }));
      throw err;   // don't open a half-built window
    }
  }

  async #init() {
    this.#manifest = await loadManifest();
    this.#tree = buildPackTree({
      folders: game.folders.filter(f => f.type === "Compendium")
        .map(f => ({ id: f.id, name: f.name, parentId: f.folder?.id ?? null })),
      packs: game.packs.filter(p => p.documentName === "Item")
        .map(p => ({ id: p.collection, name: p.metadata.label, folderId: p.folder?.id ?? null })),
    });
    const saved = game.settings.get(MODULE_ID, SETTINGS.packs) ?? [];
    this.#checked = new Set(saved.filter(id => game.packs.get(id)));
  }

  get #destination() {
    return game.settings.get(MODULE_ID, SETTINGS.destination) ?? DESTINATIONS.BOTH;
  }

  get #targets() {
    return game.settings.get(MODULE_ID, SETTINGS.targets) ?? { monsters: true, spellLists: true };
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const template = {
      configure: "configure.hbs", preview: "preview.hbs", report: "report.hbs",
    }[this.#stage];
    parts.body = { template: `modules/wc5e-foundryvtt/templates/auto-assign/${template}` };
    return parts;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.stage = this.#stage;
    if ( this.#stage === "configure" ) return Object.assign(context, this.#configureContext());
    if ( this.#stage === "preview" ) return Object.assign(context, this.#previewContext());
    return Object.assign(context, this.#reportContext());
  }

  #configureContext() {
    const destination = this.#destination;
    const targets = this.#targets;
    const available = listsAvailable(destination);
    const decorate = nodes => nodes.map(n => ({
      ...n,
      state: nodeState(n, this.#checked),
      expanded: this.#expanded.has(n.id),
      children: n.type === "folder" ? decorate(n.children) : [],
    }));
    return {
      totals: manifestTotals(this.#manifest),
      targets: { monsters: targets.monsters, lists: available && targets.spellLists },
      listsAvailable: available,
      destinations: [
        { value: DESTINATIONS.BOTH, label: game.i18n.localize("WC5E.AutoAssign.DestBoth") },
        { value: DESTINATIONS.COMPENDIUM, label: game.i18n.localize("WC5E.AutoAssign.DestPacks") },
        { value: DESTINATIONS.WORLD, label: game.i18n.localize("WC5E.AutoAssign.DestWorld") },
      ].map(d => ({ ...d, chosen: d.value === destination })),
      tree: decorate(this.#tree),
      buttons: [{ type: "button", action: "scan", icon: "fa-solid fa-magnifying-glass",
                  label: "WC5E.AutoAssign.Scan", disabled: this.#busy || !this.#checked.size }],
    };
  }

  #previewContext() {
    return {
      counts: this.#plan.counts,
      indexFailures: this.#indexFailures,
      writes: this.#plan.writes.map(w => ({
        ...w,
        scopeLabel: w.kind === "list"
          ? game.i18n.localize("WC5E.AutoAssign.ScopeList")
          : game.i18n.localize(w.scope === "pack"
            ? "WC5E.AutoAssign.ScopePack" : "WC5E.AutoAssign.ScopeWorld"),
      })),
      buttons: [
        { type: "button", action: "back", icon: "fa-solid fa-arrow-left",
          label: "WC5E.AutoAssign.Back" },
        { type: "button", action: "apply", icon: "fa-solid fa-check",
          label: "WC5E.AutoAssign.Apply",
          disabled: this.#busy || !this.#plan.writes.length },
      ],
    };
  }

  #reportContext() {
    // Grouped by source book so a GM can tell "I'm missing a whole book" from
    // "I'm missing three spells". Monster records carry no source, so those
    // land in the unknown bucket.
    const groups = new Map();
    for ( const n of this.#plan.notFound ) {
      const key = n.source || "";
      if ( !groups.has(key) ) groups.set(key, []);
      groups.get(key).push({
        ...n,
        wantedByLabel: n.wantedBy.slice(0, 3).join(", ")
          + (n.wantedBy.length > 3 ? ` +${n.wantedBy.length - 3}` : ""),
      });
    }
    const label = k => k || game.i18n.localize("WC5E.AutoAssign.SourceUnknown");
    return {
      result: this.#result,
      notFoundCount: this.#plan.notFound.length,
      notFoundGroups: [...groups.entries()]
        .sort((a, b) => label(a[0]).localeCompare(label(b[0])))
        .map(([source, spells]) => ({ label: label(source), spells })),
      buttons: [{ type: "button", action: "back", icon: "fa-solid fa-arrow-left",
                  label: "WC5E.AutoAssign.Done" }],
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if ( this.#stage !== "configure" ) return;

    for ( const el of this.element.querySelectorAll(".wc5e-aa-check") ) {
      const node = this.#findNode(el.dataset.nodeId);
      if ( node ) el.indeterminate = nodeState(node, this.#checked) === "indeterminate";
      el.addEventListener("change", ev => this.#onToggleNode(ev));
    }
    for ( const el of this.element.querySelectorAll(".wc5e-aa-toggle") ) {
      el.addEventListener("click", ev => {
        ev.preventDefault();
        const id = ev.currentTarget.dataset.nodeId;
        if ( this.#expanded.has(id) ) this.#expanded.delete(id);
        else this.#expanded.add(id);
        this.render();
      });
    }
    this.element.querySelector("[name=destination]")?.addEventListener("change", async ev => {
      await game.settings.set(MODULE_ID, SETTINGS.destination, ev.target.value);
      this.render();
    });
    for ( const [name, key] of [["target-monsters", "monsters"], ["target-lists", "spellLists"]] ) {
      this.element.querySelector(`[name="${name}"]`)?.addEventListener("change", async ev => {
        await game.settings.set(MODULE_ID, SETTINGS.targets,
          { ...this.#targets, [key]: ev.target.checked });
        this.render();
      });
    }
  }

  #findNode(id, nodes = this.#tree) {
    for ( const n of nodes ) {
      if ( n.id === id ) return n;
      if ( n.type === "folder" ) {
        const hit = this.#findNode(id, n.children);
        if ( hit ) return hit;
      }
    }
    return null;
  }

  #onToggleNode(ev) {
    const node = this.#findNode(ev.currentTarget.dataset.nodeId);
    if ( !node ) return;
    const ids = packIdsUnder(node);
    if ( ev.currentTarget.checked ) ids.forEach(id => this.#checked.add(id));
    else ids.forEach(id => this.#checked.delete(id));
    this.render();
  }

  static async #onScan() {
    if ( this.#busy ) return;
    this.#busy = true;
    try {
      const packIds = selectedPackIds(this.#tree, this.#checked);
      await game.settings.set(MODULE_ID, SETTINGS.packs, packIds);

      const targets = [];
      const chosen = this.#targets;
      if ( chosen.monsters ) targets.push(TARGETS.MONSTERS);
      if ( chosen.spellLists && listsAvailable(this.#destination) ) targets.push(TARGETS.LISTS);
      if ( !targets.length ) {
        ui.notifications.warn(game.i18n.localize("WC5E.AutoAssign.NoTargets"));
        return;
      }

      const index = await buildSearchIndex(packIds, { aliases: this.#manifest.aliases });
      this.#indexFailures = index.failed;
      const state = await collectState({ manifest: this.#manifest, targets,
                                         destination: this.#destination });
      this.#plan = buildPlan({ manifest: this.#manifest, index, targets,
                               destination: this.#destination, state });
      this.#stage = "preview";
    }
    catch ( err ) {
      console.error("wc5e-foundryvtt | auto-assign scan failed", err);
      ui.notifications.error(game.i18n.format("WC5E.AutoAssign.ScanFailed", { error: err.message }));
    }
    finally {
      this.#busy = false;
      this.render();
    }
  }

  static async #onApply() {
    if ( this.#busy ) return;
    this.#busy = true;
    this.render();
    try {
      this.#result = await applyPlan(this.#plan);
      this.#stage = "report";
    }
    catch ( err ) {
      console.error("wc5e-foundryvtt | auto-assign apply failed", err);
      ui.notifications.error(game.i18n.format("WC5E.AutoAssign.ApplyFailed", { error: err.message }));
    }
    finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onBack() {
    this.#stage = "configure";
    this.render();
  }

  static async #onCopy() {
    const text = this.#plan.notFound.map(n => n.name).join("\n");
    await game.clipboard.copyPlainText(text);
    ui.notifications.info(game.i18n.localize("WC5E.AutoAssign.Copied"));
  }
}
```

- [ ] **Step 4: Register the partial and the helpers**

The `wc5eAutoAssignNodes` partial must be registered before first render. Add to `scripts/auto-assign/app.mjs`, at module scope after the imports:

```javascript
/** Registered once; the tree template recurses through this partial. */
export async function registerTemplates() {
  const path = "modules/wc5e-foundryvtt/templates/auto-assign/nodes.hbs";
  const [tpl] = await foundry.applications.handlebars.loadTemplates([path]);
  Handlebars.registerPartial("wc5eAutoAssignNodes", tpl);
}
```

Core provides `checked` / `selected` / `disabled` / `localize`, but not equality or boolean helpers. The templates above call `wc5eEq` / `wc5eNot` / `wc5eAnd` — namespaced so the module cannot collide with another module's helper of the same name. Register them alongside:

```javascript
export function registerHelpers() {
  Handlebars.registerHelper("wc5eEq", (a, b) => a === b);
  Handlebars.registerHelper("wc5eNot", a => !a);
  Handlebars.registerHelper("wc5eAnd", (a, b) => !!(a && b));
}
```

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-assign/app.mjs templates/auto-assign/
git commit -m "Add the auto-assign dialog

Three stages in one window: configure (targets, destination, pack tree),
preview, report. Handlebars helpers are namespaced so they cannot collide with
another module's."
```

---

### Task 11: Entry point, settings, menu and first-run prompt

**Files:**
- Create: `scripts/wc5e.mjs`
- Create: `lang/en.json`
- Modify: `module.json` — add `esmodules`, `languages`. **No version change.**
- Modify: `build/release.mjs:25` — add `scripts`, `templates`, `lang` to `RUNTIME`

**Interfaces:**
- Consumes: `AutoAssignApp`, `SETTINGS`, `registerTemplates`, `registerHelpers` from Task 10;
  `loadManifest`, `manifestTotals` from Task 5.

- [ ] **Step 1: Write the entry point**

Create `scripts/wc5e.mjs`:

```javascript
import { AutoAssignApp, SETTINGS, registerTemplates, registerHelpers } from "./auto-assign/app.mjs";
import { loadManifest, manifestTotals } from "./auto-assign/manifest.mjs";
import { DESTINATIONS } from "./auto-assign/plan.mjs";

const MODULE_ID = "wc5e-foundryvtt";

Hooks.once("init", () => {
  registerHelpers();

  game.settings.registerMenu(MODULE_ID, "autoAssignMenu", {
    name: "WC5E.AutoAssign.MenuName",
    label: "WC5E.AutoAssign.MenuLabel",
    hint: "WC5E.AutoAssign.MenuHint",
    icon: "fa-solid fa-wand-magic-sparkles",
    type: AutoAssignApp,     // registerMenu accepts any ApplicationV2 subclass;
    restricted: true,        // AutoAssignApp loads itself in _preFirstRender
  });

  game.settings.register(MODULE_ID, SETTINGS.packs, {
    scope: "world", config: false, type: Array, default: [],
  });
  game.settings.register(MODULE_ID, SETTINGS.targets, {
    scope: "world", config: false, type: Object,
    default: { monsters: true, spellLists: true },
  });
  game.settings.register(MODULE_ID, SETTINGS.destination, {
    scope: "world", config: false, type: String, default: DESTINATIONS.BOTH,
  });
  game.settings.register(MODULE_ID, SETTINGS.dismissed, {
    scope: "world", config: false, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.promptedVersion, {
    scope: "world", config: false, type: String, default: "",
  });
});

Hooks.once("ready", async () => {
  await registerTemplates();
  if ( !game.user.isGM ) return;
  if ( game.settings.get(MODULE_ID, SETTINGS.dismissed) ) return;

  const version = game.modules.get(MODULE_ID)?.version ?? "";
  if ( game.settings.get(MODULE_ID, SETTINGS.promptedVersion) === version ) return;

  let totals;
  try {
    totals = manifestTotals(await loadManifest());
  }
  catch ( err ) {
    console.warn("wc5e-foundryvtt | could not read the auto-assign manifest", err);
    return;
  }
  if ( !totals.monsterSpells && !totals.listSpells ) return;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("WC5E.AutoAssign.PromptTitle") },
    content: `<p>${game.i18n.format("WC5E.AutoAssign.PromptBody", totals)}</p>`
      + `<p class="notes">${game.i18n.localize("WC5E.AutoAssign.UpdateCaveat")}</p>`,
    buttons: [
      { action: "run", icon: "fa-solid fa-wand-magic-sparkles",
        label: game.i18n.localize("WC5E.AutoAssign.PromptRun"), default: true },
      { action: "later", label: game.i18n.localize("WC5E.AutoAssign.PromptLater") },
      { action: "never", label: game.i18n.localize("WC5E.AutoAssign.PromptNever") },
    ],
    rejectClose: false,
  });

  if ( choice === "never" ) await game.settings.set(MODULE_ID, SETTINGS.dismissed, true);
  await game.settings.set(MODULE_ID, SETTINGS.promptedVersion, version);
  if ( choice === "run" ) AutoAssignApp.show();
});
```

- [ ] **Step 2: Write the language file**

Create `lang/en.json`:

```json
{
  "WC5E.AutoAssign.Title": "Auto-Assign Spells",
  "WC5E.AutoAssign.MenuName": "Auto-Assign Spells",
  "WC5E.AutoAssign.MenuLabel": "Open",
  "WC5E.AutoAssign.MenuHint": "Search your own compendiums for the spells this module cannot include, and assign them to WC5E monsters and class spell lists.",
  "WC5E.AutoAssign.Intro": "Some spells referenced by WC5E come from sourcebooks that cannot be redistributed, so they ship as text only. This searches compendiums you choose and assigns the ones you already own. Nothing is ever removed or overwritten.",
  "WC5E.AutoAssign.TargetsLegend": "What to fill in",
  "WC5E.AutoAssign.TargetMonsters": "Monsters",
  "WC5E.AutoAssign.TargetLists": "Class spell lists",
  "WC5E.AutoAssign.ListsNeedCompendium": "Spell lists live only in the compendium, so they cannot be updated with the world-only destination.",
  "WC5E.AutoAssign.DestinationLegend": "Where to write",
  "WC5E.AutoAssign.DestBoth": "Compendium + world actors",
  "WC5E.AutoAssign.DestPacks": "Compendium only",
  "WC5E.AutoAssign.DestWorld": "World actors only",
  "WC5E.AutoAssign.SearchLegend": "Where to search",
  "WC5E.AutoAssign.SearchHint": "Tick the compendiums to search. Only what you tick is read, and the first match in this order wins.",
  "WC5E.AutoAssign.UpdateCaveat": "Updating this module replaces its compendiums, so compendium assignments are lost on update and this needs running again. Your selection is remembered.",
  "WC5E.AutoAssign.Scan": "Scan",
  "WC5E.AutoAssign.Back": "Back",
  "WC5E.AutoAssign.Done": "Done",
  "WC5E.AutoAssign.Apply": "Apply",
  "WC5E.AutoAssign.CopyList": "Copy list",
  "WC5E.AutoAssign.Copied": "Copied to the clipboard.",
  "WC5E.AutoAssign.NoTargets": "Choose at least one thing to fill in.",
  "WC5E.AutoAssign.ScanFailed": "Scan failed: {error}",
  "WC5E.AutoAssign.ApplyFailed": "Apply failed: {error}",
  "WC5E.AutoAssign.LoadFailed": "Could not open Auto-Assign Spells: {error}",
  "WC5E.AutoAssign.SourceUnknown": "Source not recorded",
  "WC5E.AutoAssign.IndexFailures": "Some compendiums could not be read and were skipped:",
  "WC5E.AutoAssign.ScopePack": "compendium",
  "WC5E.AutoAssign.ScopeWorld": "world actor",
  "WC5E.AutoAssign.ScopeList": "spell list",
  "WC5E.AutoAssign.PreviewSummary": "Will add {spells} spells to {monsters} monsters, and {entries} entries to {lists} spell lists.",
  "WC5E.AutoAssign.PreviewNotFound": "{count} spells were not found in the compendiums you selected.",
  "WC5E.AutoAssign.ReportSummary": "Added {added} spells and {entries} spell-list entries.",
  "WC5E.AutoAssign.ReportFailures": "Some writes failed:",
  "WC5E.AutoAssign.NotFoundHeading": "Not found ({count})",
  "WC5E.AutoAssign.NotFoundHint": "These are not in the compendiums you searched. If you own them, import them and run this again.",
  "WC5E.AutoAssign.PromptTitle": "Warcraft 5e — Auto-Assign Spells",
  "WC5E.AutoAssign.PromptBody": "Some spells WC5E references cannot be shipped with this module, so {monsterSpells} monster spells and {listSpells} spell-list entries are currently blank. If you own that content, Auto-Assign Spells can find it in your compendiums and fill them in.",
  "WC5E.AutoAssign.PromptRun": "Run it now",
  "WC5E.AutoAssign.PromptLater": "Later",
  "WC5E.AutoAssign.PromptNever": "Don't show again"
}
```

- [ ] **Step 3: Wire the manifest**

In `module.json`, add after the `"relationships"` block (do **not** touch `"version"` or `"download"`):

```json
  "esmodules": [
    "scripts/wc5e.mjs"
  ],
  "languages": [
    {
      "lang": "en",
      "name": "English",
      "path": "lang/en.json"
    }
  ],
```

- [ ] **Step 4: Ship the new directories in the release archive**

In `build/release.mjs`, change line 25 from:

```javascript
const RUNTIME = ["module.json", "packs", "assets", "LICENSE.md", "README.md"];
```

to:

```javascript
const RUNTIME = ["module.json", "packs", "assets", "scripts", "templates", "lang",
                 "LICENSE.md", "README.md"];
```

- [ ] **Step 5: Confirm nothing regressed on the build side**

Run: `npm run verify && npm test`
Expected: both pass. `module.json` `version` is still `1.16.0`.

Run: `git diff module.json | grep -c '"version"'`
Expected: `0` — the version line is untouched.

- [ ] **Step 6: Commit**

```bash
git add scripts/wc5e.mjs lang/en.json module.json build/release.mjs
git commit -m "Wire up the auto-assign settings menu and first-run prompt

The module's first runtime JavaScript. The prompt fires once per module
version for GMs, because a module update replaces the packs and the tool has
to be re-run. No version bump: this is untested in a live world."
```

---

### Task 12: Manual verification and documentation

Nothing before this has been exercised in Foundry. This task is where it actually gets tested, and the docs follow what the testing shows.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `build/build_journal.py` — `WELCOME` and `ROADMAP`

- [ ] **Step 1: Install the working copy into Foundry and load the world**

Symlink the repo into the data directory so edits are live:

```bash
ln -sfn /mnt/games-2/projects/foundry-wc5e ~/.local/share/FoundryVTT/Data/modules/wc5e-foundryvtt
```

Then start Foundry, open the `warcraft` world, and confirm the module loads with no console errors.

If a previous copy of the module is installed as a real directory, move it aside first rather than deleting it.

- [ ] **Step 2: Work through the checklist**

Record the outcome of each item. Any failure is a bug to fix before the remaining steps.

1. Fresh GM login shows the first-run prompt naming the two counts.
2. "Later" dismisses it; reloading does **not** show it again (same version).
3. "Don't show again" survives a reload.
4. Settings → Module Settings → Auto-Assign Spells opens the dialog.
5. The tree matches the compendium sidebar, including `DBB Core Source → DBB Core Source Spells` nesting.
6. Ticking a folder ticks its whole subtree; unticking one pack inside leaves the folder indeterminate.
7. Choosing "World actors only" disables the *Class spell lists* target and shows the hint.
8. Scan with nothing ticked is refused rather than running empty.
9. Preview counts match the report counts after Apply.
10. A monster with a known gap (pick one from `assets/missing-spells.json`) gains exactly the missing spells, at the right preparation mode, and keeps everything it already had.
11. An innate caster's added spell shows the right per-day uses.
12. Running a second time previews **zero** additions and still lists the not-found spells.
13. Manually add a spell to a monster, re-run, and confirm it survives.
14. After Apply, the WC5E packs are locked again (check the compendium's context menu).
15. A spell list gains its new entries and keeps the ones it had; the compendium browser filters by class correctly afterwards.
16. Log in as a player: no prompt, and no Auto-Assign entry in the settings menu.
17. Console is free of errors throughout.

- [ ] **Step 3: Document it in CLAUDE.md**

Under the "What this is" section, replace:

```markdown
generated from the community [Warcraft 5e Conversion](https://github.com/WC5E/Warcraft-5e-Conversion)
markdown. There is no runtime JavaScript: the module ships only `module.json`, `assets/`, and
compiled LevelDB packs. Everything else in the repo is build tooling.
```

with:

```markdown
generated from the community [Warcraft 5e Conversion](https://github.com/WC5E/Warcraft-5e-Conversion)
markdown. The module ships `module.json`, `assets/`, `lang/`, compiled LevelDB packs, and one
runtime feature — the **auto-assign tool** (`scripts/`, `templates/`). Everything else in the repo
is build tooling.
```

Then add a new section after "Escape hatches for bad conversions":

```markdown
## The auto-assign tool (the only runtime JavaScript)

Non-SRD spells can't be bundled, so 154 monster spell references and 224 spell-list entries ship
blank. `scripts/auto-assign/` is a GM-facing tool that searches compendiums the GM ticks, assigns
what it finds, and reports what it doesn't. Only *names* are in the repo; the spell documents come
from the user's own content.

`assets/missing-spells.json` is the contract between the build and the runtime, written by
`build/missing_spells.py`. **Three builders contribute to it at different points in the build**
(`build/convert-monster-json/main.ts` for monsters, `build_spell_lists.py` and `build_subclass_spells.py` for the two
list journals), so each replaces only its own section — the same hazard that once made the two list
builders overwrite each other's `flags.dnd5e.spellLists`.

- `manifest.mjs`'s `normaliseName()` is a **port of `spell_embed._norm()`**. If they drift, every
  lookup misses and the tool silently finds nothing. `tests/normalise.test.mjs` runs the JS
  normaliser over every record in the real manifest and asserts it reproduces the key Python wrote.
  Keep that test passing.
- `plan.mjs` is pure, which is what makes "additive and idempotent" testable: a second run must
  plan zero writes. Never let it read from `game` directly.
- Spell lists exist only in the compendium, so the *Class spell lists* target is unavailable for
  the world-only destination. This is enforced in `listsAvailable()` **and** disabled in the UI.
- **A module update replaces `packs/`**, so compendium-side assignments are lost on upgrade. The
  first-run prompt re-fires once per module version to say so.

`npm test` runs both suites: `python3 -m unittest` for the build side, `node --test` for the
runtime. Both are stdlib — no test dependencies. The Foundry-coupled parts (`app.mjs`, and the
pack writes in `apply.mjs`) can't be tested headlessly; the checklist for those is in
`docs/superpowers/plans/2026-08-01-auto-assign-spells.md`.
```

- [ ] **Step 4: Document it in README.md**

Find the features/contents list and add an entry describing the tool for users, in the same voice as its neighbours:

```markdown
### Auto-assign spells you already own

Some spells WC5E references come from sourcebooks that can't be redistributed, so they ship as
text only. If you own that content, **Settings → Module Settings → Auto-Assign Spells** will search
compendiums you pick, add the spells it finds to the WC5E monsters and class spell lists, and show
you a list of anything it couldn't find. Nothing is ever removed or overwritten, and it's safe to
run twice.

Updating the module replaces its compendiums, so run it again after an update — your compendium
selection is remembered.
```

- [ ] **Step 5: Document it in the in-module journal**

In `build/build_journal.py`, in `WELCOME`, replace this bullet:

```html
  <li>Some monster spells and abilities reference <em>non-SRD</em> spells
    (Tasha's/Xanathar's) that can't be bundled — those stay listed as text; drag
    them from your own content if you own it.</li>
```

with:

```html
  <li>Some monster spells and abilities reference <em>non-SRD</em> spells that
    can't be bundled — those stay listed as text. If you own that content,
    <strong>Settings → Module Settings → Auto-Assign Spells</strong> will find it
    in your own compendiums and fill it in for you, and tell you what it
    couldn't find.</li>
```

and in `ROADMAP`, move the planned item

```html
  <li>&#9744; Wire the remaining non-SRD spells (needs official content)</li>
```

into the Done list as

```html
  <li>&#9745; Auto-assign non-SRD spells from your own compendiums</li>
```

- [ ] **Step 6: Rebuild, verify, and confirm determinism**

Run: `npm run build && npm run verify && npm test && git status --porcelain`
Expected: all pass; the only modified files are the journal source and `src/journals/readme.json`, plus the compiled `packs/journals`.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md build/build_journal.py src/journals packs/journals
git commit -m "Document the auto-assign tool

Manual checklist run against Foundry v14 / dnd5e 5.3.3 in the warcraft world."
```

- [ ] **Step 8: Report back, do not release**

Summarise the checklist results. **Do not** bump `module.json` `version`, do not run
`npm run release`, and do not create a tag or a GitHub release. The user tests before any of that
happens.

---

## Notes for the implementer

- **`assets/missing-spells.json` is generated.** Never hand-edit it; change the builder.
- **Do not run `npm run build` on a dirty tree without committing first.** Every builder deletes its
  output directory before writing, so a crash mid-build guts `src/<pack>/`. `git checkout -- src/`
  is the recovery.
- **`npm run spells` must run before `npm run actors` and before `npm run spell-lists`.** The
  `build` script already orders them correctly.
- The repo had no tests before this plan. `npm test` is new; keep both suites passing.
