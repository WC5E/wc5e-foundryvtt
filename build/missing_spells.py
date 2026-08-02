#!/usr/bin/env python3
"""missing_spells.py -- Collect the spell names we could not resolve at build time.

Three builders contribute: build_actors.py (via spell_embed) for monsters, and
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
