#!/usr/bin/env python3
"""
build_subclass_spells.py -- Wire up the subclass spell tables from the Heroes
Handbook. Two different upstream shapes need two different dnd5e mechanisms:

1. Keyed by CLASS level -- Oath / Path / Priesthood / Binding spells:

       | Paladin Level| Spells                     |
       | 3rd  | sanctuary, shield of faith         |

   These are granted automatically and are always prepared, exactly like dnd5e's
   cleric domain spells. So they become `ItemGrant` advancements on the subclass
   at those levels, with `spell.preparation: "always"`.

2. Keyed by SPELL level -- the warlock "Expanded Spells":

       | Spell Level | Spells                  |
       | 1st | fog cloud, mind blast           |

   These widen what the character may *choose*, so they become a spell-list
   JournalEntryPage with `system.type: "subclass"` (dnd5e's spellListTypes
   includes class/subclass/background/race/other) and are registered in
   `flags.dnd5e.spellLists` alongside the class lists.

Upstream names the paladin subclasses "Oath of X" while the class documents call
them "Path of X", and several subclass names collide across classes ("Holy" the
priesthood vs "Path of the Holy" the oath, "Restoration" the binding vs "Path of
Restoration" the druid path), so the mapping is explicit and validated against
each subclass's classIdentifier rather than matched by name.

Idempotent in the same way as build_spell_progression.py: generated advancement
ids are deterministic and the whole candidate set is removed before re-inserting.
"""
import json
import os
import re
import hashlib

import missing_spells
import spell_embed

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
HHB = os.path.join(os.path.dirname(REPO), "Warcraft-5e-Conversion",
                   "Heroes Handbook, Main File.txt")

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))

def squash(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

# upstream section heading -> (subclass document name, expected classIdentifier)
SECTIONS = {
    "Path of Balance Spells":      ("Path of Balance", "wc5e-druid"),
    "Path of Restoration Spells":  ("Path of Restoration", "wc5e-druid"),
    "Oath of the Holy Spells":     ("Path of the Holy", "wc5e-paladin"),
    "Oath of Protection Spells":   ("Path of Protection", "wc5e-paladin"),
    "Oath of Retribution Spells":  ("Path of Retribution", "wc5e-paladin"),
    "Discipline Priesthood Spells": ("Discipline", "wc5e-priest"),
    "Holy Priesthood Spells":      ("Holy", "wc5e-priest"),
    "Shadow Priesthood Spells":    ("Shadow", "wc5e-priest"),
    "Elemental Binding Spells":    ("Elemental", "wc5e-shaman"),
    "Enhancement Binding Spells":  ("Enhancement", "wc5e-shaman"),
    "Restoration Binding Spells":  ("Restoration", "wc5e-shaman"),
    "Affliction Expanded Spells":  ("Study of Affliction", "wc5e-warlock"),
    "Demonology Expanded Spells":  ("Study of Demonology", "wc5e-warlock"),
    "Destruction Expanded Spells": ("Study of Destruction", "wc5e-warlock"),
}

# Subclass spell grants that exist in the current class PDFs but not yet in the
# cloned conversion repo, transcribed by hand. Subtlety was redesigned: the repo
# still carries the older third-caster version ("two cantrips from the subtlety
# spell list", a Spells Known table, and a spell list that was never written),
# while the current Rogue PDF replaces all of it with "Subtle Magic" -- a fixed
# set granted at rogue levels, cast from a bespoke slot pool. Keyed by class
# level, so these go through the same always-prepared ItemGrant path as the
# oaths and priesthoods. Drop an entry here once upstream catches up.
CURATED = {
    "Subtlety": {
        "class": "wc5e-rogue",
        "source": "Subtle Magic Spells (Rogue PDF)",
        "levels": {
            3:  ["fog cloud", "feather fall"],
            7:  ["darkness", "invisibility"],
            11: ["nondetection", "darkvision"],
            15: ["greater invisibility", "sending"],
        },
    },
}

ALIAS = {"devouringplauge": "devouringplague", "rightoussmite": "righteoussmite",
         "shadowyappriations": "shadowyapparitions", "summonvoidfiend": "summonvoidbeing",
         # upstream singular/typo variants of real spell names
         "blacktentacle": "blacktentacles", "bindingsmite": "banishingsmite"}

ORDINAL = re.compile(r"^\s*(\d{1,2})\s*(?:st|nd|rd|th)\s*$", re.IGNORECASE)


def cell(c):
    """Strip the typesetting noise the tables are padded with."""
    c = c.replace("&nbsp;", " ").replace("\u00a0", " ")
    c = re.sub(r"<[^>]+>", "", c)
    return re.sub(r"\s+", " ", c).strip()


def load_index():
    """squashed spell name -> compendium UUID (ours wins over the SRD)."""
    idx = {}
    for name, pack in (("srd52_spell_ids.json", "spells24"),
                       ("srd51_spell_ids.json", "spells")):
        data = json.load(open(os.path.join(REPO, "reference", "srd-index", name), encoding="utf-8"))
        for n, i in data.items():
            idx[squash(n)] = f"Compendium.dnd5e.{pack}.Item.{i}"
    ours = os.path.join(REPO, "src", "generated", "spells")
    for fn in os.listdir(ours):
        if fn.endswith(".json") and not fn.startswith("_folder-"):
            d = json.load(open(os.path.join(ours, fn), encoding="utf-8"))
            idx[squash(d["name"])] = f"Compendium.wc5e-foundryvtt.spells.Item.{d['_id']}"
    return idx


def parse_sections(text):
    """-> {heading: (kind, {level: [spell names]})} where kind is 'class'|'spell'."""
    lines = text.split("\n")
    out = {}
    i = 0
    while i < len(lines):
        m = re.match(r"^\s*#{4,5}\s*(.+?Spells)\s*$", lines[i])
        if not m or m.group(1).strip() not in SECTIONS:
            i += 1
            continue
        heading = m.group(1).strip()
        i += 1
        while i < len(lines) and not lines[i].lstrip().startswith("|"):
            if lines[i].lstrip().startswith("#"):
                break
            i += 1
        if i >= len(lines) or not lines[i].lstrip().startswith("|"):
            continue
        header = lines[i]
        kind = "spell" if re.search(r"spell\s*level", header, re.IGNORECASE) else "class"
        # Column positions vary: the paladin/priest tables are 2-column, the druid
        # ones insert an &nbsp; spacer column, so find "Spells" by header rather
        # than assuming index 1.
        head = [cell(c) for c in lines[i].strip().strip("|").split("|")]
        try:
            scol = next(n for n, h in enumerate(head) if "spell" in h.lower() and "level" not in h.lower())
        except StopIteration:
            scol = len(head) - 1
        i += 1
        if i < len(lines) and re.match(r"^\s*\|[\s:|-]+\|?\s*$", lines[i]):
            i += 1
        rows = {}
        while i < len(lines) and lines[i].lstrip().startswith("|"):
            cells = [cell(c) for c in lines[i].strip().strip("|").split("|")]
            if len(cells) > scol:
                lm = ORDINAL.match(cells[0])
                if lm:
                    # Split on commas only. "enlarge/reduce" and "blindness/deafness"
                    # are single spells whose names contain a slash.
                    names = [re.sub(r"\*", "", n).strip() for n in cells[scol].split(",")]
                    names = [n for n in names if 2 < len(n) < 45]
                    if names:
                        rows[int(lm.group(1))] = names
            i += 1
        if rows:
            out[heading] = (kind, rows)
    return out


def item_grant(sub, level, uuids):
    """Always-prepared spells granted at a class level (domain-spell style)."""
    return {
        "_id": make_id("subspell", sub, level),
        "type": "ItemGrant",
        "title": "Subclass Spells",
        "hint": "",
        "configuration": {
            "items": [{"uuid": u, "optional": False} for u in uuids],
            "optional": False,
            # always prepared, and cast with the class's own spellcasting ability
            "spell": {"ability": [], "preparation": "always",
                      "uses": {"max": "", "per": ""}},
        },
        "value": {},
        "level": level,
        "classRestriction": "",
    }


def page(journal_id, sub_name, identifier, uuids, missing, sort):
    pid = make_id("sublist", identifier)
    desc = ""
    if missing:
        desc = ("<p>These spells are on this subclass's expanded list but are not included "
                "in this module (non-SRD sourcebooks that can't be redistributed):</p><ul>"
                + "".join(f"<li>{n}</li>" for n in missing) + "</ul>")
    return {
        "_id": pid, "name": f"{sub_name} Spells", "type": "spells",
        "title": {"show": False, "level": 1}, "category": None, "image": {},
        "src": None, "video": {"controls": True, "volume": 0.5},
        "text": {"format": 1, "content": "", "markdown": ""},
        "system": {
            "identifier": identifier, "type": "subclass", "grouping": "level",
            "description": {"value": desc}, "unlinkedSpells": [], "spells": uuids,
        },
        "sort": sort, "ownership": {"default": -1}, "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!journal.pages!{journal_id}.{pid}",
    }


def main():
    if not os.path.exists(HHB):
        raise SystemExit(f"upstream source not found: {HHB}")
    idx = load_index()
    sections = parse_sections(open(HHB, encoding="utf-8", errors="replace").read())

    subs = {}
    for fn in os.listdir(os.path.join(REPO, "src", "authored", "classes")):
        if not fn.endswith(".json"):
            continue
        p = os.path.join(REPO, "src", "authored", "classes", fn)
        d = json.load(open(p, encoding="utf-8"))
        if d.get("type") == "subclass":
            subs[d["name"]] = (p, d)

    granted, expanded, report = 0, [], []

    # curated entries first, so they behave exactly like a parsed section
    jobs = [(h, n, c, sections.get(h)) for h, (n, c) in SECTIONS.items()]
    for name, spec in CURATED.items():
        jobs.append((spec["source"], name, spec["class"], ("class", spec["levels"])))

    for heading, name, expect_class, parsed in jobs:
        if parsed is None:
            report.append((heading, name, "SECTION NOT FOUND", 0, []))
            continue
        if name not in subs:
            report.append((heading, name, "NO SUBCLASS DOC", 0, []))
            continue
        path, doc = subs[name]
        ident = doc["system"].get("identifier")
        actual = doc["system"].get("classIdentifier")
        if actual != expect_class:
            report.append((heading, name, f"CLASS MISMATCH {actual} != {expect_class}", 0, []))
            continue
        kind, rows = parsed

        resolved, missing = {}, []
        for lv, names in sorted(rows.items()):
            uu = []
            for n in names:
                key = ALIAS.get(squash(n), squash(n))
                u = idx.get(key)
                if u:
                    uu.append(u)
                else:
                    missing.append(n)
            if uu:
                resolved[lv] = uu

        if kind == "class":
            adv = doc["system"].setdefault("advancement", [])
            mine = {make_id("subspell", name, lv) for lv in range(1, 21)}
            kept = [a for a in adv if a.get("_id") not in mine]
            doc["system"]["advancement"] = kept + [
                item_grant(name, lv, uu) for lv, uu in sorted(resolved.items())]
            json.dump(doc, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
            open(path, "a", encoding="utf-8").write("\n")
            granted += sum(len(u) for u in resolved.values())
            report.append((heading, name, f"granted at L{sorted(resolved)}",
                           sum(len(u) for u in resolved.values()), missing))
        else:
            flat = [u for lv in sorted(resolved) for u in resolved[lv]]
            expanded.append((name, ident, flat, missing))
            report.append((heading, name, "expanded list",
                           len(flat), missing))

    # one journal entry holding the expanded (choosable) subclass lists
    if expanded:
        jid = make_id("journal", "wc5e-subclass-spell-lists")
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
                        ({"name": spell_embed._display(n), "key": spell_embed._norm(n), "source": ""}
                         for n in missing),
                        key=lambda s: s["key"]),
                }
            sort += 100000
        missing_spells.set_spell_lists(jid, missing_records)
        entry = {
            "_id": jid, "name": "WC5E Subclass Spell Lists", "pages": pages,
            "folder": None, "sort": 100000, "ownership": {"default": 0}, "flags": {},
            "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
            "_key": f"!journal!{jid}",
        }
        out = os.path.join(REPO, "src", "generated", "spell-lists")
        with open(os.path.join(out, "subclass-spell-lists.json"), "w", encoding="utf-8") as f:
            json.dump(entry, f, indent=2, ensure_ascii=False)
        # register the new pages alongside the class lists
        mpath = os.path.join(REPO, "module", "module.json")
        manifest = json.load(open(mpath, encoding="utf-8"))
        flags = manifest.setdefault("flags", {}).setdefault("dnd5e", {})
        existing = [u for u in flags.get("spellLists", []) if jid not in u]
        flags["spellLists"] = existing + [
            f"Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.{jid}"
            f".JournalEntryPage.{p['_id']}" for p in pages]
        with open(mpath, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.write("\n")

    print(f"  {granted} spells granted as always-prepared subclass spells")
    print(f"  {len(expanded)} expanded subclass spell lists "
          f"({sum(len(u) for _, _, u, _ in expanded)} spells)\n")
    for heading, name, note, n, missing in report:
        print(f"  {name:22s} {note[:34]:34s} {n:3d} linked"
              + (f"  omitted: {', '.join(missing[:4])}" if missing else ""))


if __name__ == "__main__":
    main()
