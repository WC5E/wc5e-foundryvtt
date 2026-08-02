#!/usr/bin/env python3
"""
build_spell_lists.py -- Build dnd5e class spell lists from the WC5E class spell
tables into src/spell-lists/.

dnd5e links a class to its spell list through a JournalEntryPage of type
"spells" whose `system.identifier` matches the class's `system.identifier`.
Class features then reference it as `restriction.list: ["class:<identifier>"]`,
and the character sheet uses it to decide which spells a caster may learn or
prepare. Without these pages a custom class has no spell list at all, which is
why spell selection is missing for the WC5E classes.

Source: "WIP 3.0 Chapters/Chapter 6 Spells.md" in the upstream conversion, where
each caster has a `### <Class> Spells` section subdivided by
`##### Cantrips (0 Level)` / `##### Nth Level`. Entries are marked up:

    ✦ Chains of Ice        -> a WC5E custom spell (this module's spells pack)
    Absorb Elements ^XGE^  -> non-SRD official content (cannot be bundled)
    Bane                   -> SRD (the dnd5e system's own pack)

Blockquoted `> ##### Variant Rule: ...` sections are alternate optional lists
and are deliberately skipped.

Spells that resolve to neither this module nor the SRD are listed in each page's
description so the omission is visible in-game rather than silent.
"""
import json
import os
import re
import hashlib

import missing_spells
import spell_embed

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(REPO), "Warcraft-5e-Conversion",
                   "WIP 3.0 Chapters", "Chapter 6 Spells.md")

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))


def squash(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Upstream typos / variants -> the name this module actually ships.
ALIAS = {
    "devouringplauge": "devouringplague",
    "rightoussmite": "righteoussmite",
    "shadowyappriations": "shadowyapparitions",
    "summonvoidfiend": "summonvoidbeing",
    "thunderwave": "thunderwave",
    # Source abbreviates a real SRD spell; without this, the Death Knight,
    # Paladin and Priest lists omit it and the manifest mislabels it
    # "not in SRD", sending the GM shopping for something dnd5e already ships.
    "protfromevilandgood": "protectionfromevilandgood",
}

# Spells this module ships that the Chapter 6 class tables never list, normally
# because they only exist in the finished Heroes Handbook. Without this they'd be
# unreachable: present in the spells compendium but on no class's list.
EXTRA_ENTRIES = {
    "wc5e-shaman": [("Feral Spirits", 3)],
}

LEVEL_RE = re.compile(r"^#{4,5}\s*(?:Cantrips?\s*\(0\s*Level\)|(\d)(?:st|nd|rd|th)\s+Level)",
                      re.IGNORECASE)
CLASS_RE = re.compile(r"^###\s+(.+?)\s+Spells\s*$")


def clean_entry(line):
    """A list entry -> (name, source_marker) or None."""
    t = line.strip()
    # Long names are wrapped in the source with non-breaking spaces and soft
    # hyphens purely for typesetting ("Amplify or &nbsp;&nbsp; Dampen Magic").
    # Left in, they break the name match and the spell looks unavailable.
    t = t.replace("&nbsp;", " ").replace(" ", " ")
    t = t.replace("&shy;", "").replace("­", "")
    t = re.sub(r"^<br\s*/?>", "", t).strip()
    if not t or t.startswith(("<div", "</div", "\\", "#", ">", "___", "|")):
        return None
    # source superscripts: ^XGE^, ^TCE^, ^SCAG^ ...
    marker = ""
    m = re.search(r"\^([A-Za-z]+)\^", t)
    if m:
        marker = m.group(1).upper()
        t = re.sub(r"\^[A-Za-z]+\^", "", t)
    custom = "✦" in t
    t = t.replace("✦", "")
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\s+", " ", t).strip(" .*")
    if not t or len(t) > 45:
        return None
    return t, ("custom" if custom else marker or "srd")


def parse_lists(path):
    """-> {class_name: {level_int: [(name, kind), ...]}}"""
    out = {}
    cur_class = None
    cur_level = None
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        # never read the optional variant-rule blocks
        if line.startswith(">"):
            continue
        cm = CLASS_RE.match(line)
        if cm:
            cur_class = cm.group(1).strip()
            out.setdefault(cur_class, {})
            cur_level = None
            continue
        if cur_class is None:
            continue
        lm = LEVEL_RE.match(line)
        if lm:
            cur_level = int(lm.group(1)) if lm.group(1) else 0
            out[cur_class].setdefault(cur_level, [])
            continue
        # a new non-list heading closes the current class section
        if line.startswith("#") and not LEVEL_RE.match(line):
            cur_class, cur_level = None, None
            continue
        if cur_level is None:
            continue
        got = clean_entry(line)
        if got:
            out[cur_class][cur_level].append(got)
    return {k: v for k, v in out.items() if any(v.values())}


def load_indexes():
    """squashed name -> full compendium UUID, for every pack we may cite."""
    idx = {}
    # this module's own spells win over the SRD
    srd51 = json.load(open(os.path.join(HERE, "data", "srd51_spell_ids.json"), encoding="utf-8"))
    srd52 = json.load(open(os.path.join(HERE, "data", "srd52_spell_ids.json"), encoding="utf-8"))
    for name, _id in srd52.items():
        idx.setdefault(squash(name), f"Compendium.dnd5e.spells24.Item.{_id}")
    for name, _id in srd51.items():
        idx[squash(name)] = f"Compendium.dnd5e.spells.Item.{_id}"
    ours = os.path.join(REPO, "src", "spells")
    for fn in os.listdir(ours):
        if not fn.endswith(".json") or fn.startswith("_folder-"):
            continue
        d = json.load(open(os.path.join(ours, fn), encoding="utf-8"))
        idx[squash(d["name"])] = f"Compendium.wc5e-foundryvtt.spells.Item.{d['_id']}"
    return idx


def class_identifiers():
    """Display name -> dnd5e class identifier, read from the class documents."""
    out = {}
    cdir = os.path.join(REPO, "src", "classes")
    for fn in os.listdir(cdir):
        if not fn.endswith(".json"):
            continue
        d = json.load(open(os.path.join(cdir, fn), encoding="utf-8"))
        if d.get("type") == "class" and d["system"].get("identifier"):
            out[d["name"]] = d["system"]["identifier"]
    return out


def page(journal_id, cls, identifier, uuids, missing, sort):
    pid = make_id(journal_id, identifier)
    desc = ""
    if missing:
        items = "".join(f"<li>{n} <em>({m})</em></li>" for n, m in missing)
        desc = ("<p>The following spells appear on this class's WC5E spell list but "
                "are not included in this module, because they come from non-SRD "
                "official sourcebooks that cannot be redistributed. If your world has "
                "them, add them to the list manually.</p>"
                f"<ul>{items}</ul>")
    return {
        "_id": pid,
        "name": f"{cls} Spells",
        "type": "spells",
        "title": {"show": False, "level": 1},
        "category": None,
        "image": {},
        "src": None,
        "video": {"controls": True, "volume": 0.5},
        "text": {"format": 1, "content": "", "markdown": ""},
        "system": {
            "identifier": identifier,
            "type": "class",
            "grouping": "level",
            "description": {"value": desc},
            "unlinkedSpells": [],
            "spells": uuids,
        },
        "sort": sort,
        "ownership": {"default": -1},
        "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!journal.pages!{journal_id}.{pid}",
    }


def register_in_manifest(journal_id, pages):
    """Write the page UUIDs into module.json `flags.dnd5e.spellLists`.

    THIS IS NOT OPTIONAL. dnd5e discovers spell lists *only* from that manifest
    flag -- `registerSpellLists()` returns immediately unless
    `flags.dnd5e.spellLists` is an array, and `SpellListRegistry.register()`
    resolves each entry with `fromUuid()` and rejects anything whose
    `page.type !== "spells"`. Without it the pages sit in the compendium
    completely inert: the compendium browser can't filter by class and any
    advancement restricted to `class:<identifier>` resolves to an empty pool.
    Generated here rather than hand-written so the UUIDs can never drift from
    the documents.
    """
    path = os.path.join(REPO, "module.json")
    manifest = json.load(open(path, encoding="utf-8"))
    uuids = [f"Compendium.wc5e-foundryvtt.spell-lists.JournalEntry.{journal_id}"
             f".JournalEntryPage.{p['_id']}" for p in pages]
    flags = manifest.setdefault("flags", {}).setdefault("dnd5e", {})
    # Preserve registrations owned by other builders (build_subclass_spells.py adds
    # its own journal's pages here), so the two can run in either order without one
    # silently unregistering the other's lists.
    others = [u for u in flags.get("spellLists", []) if journal_id not in u]
    merged = others + uuids
    if flags.get("spellLists") == merged:
        print(f"  module.json flags.dnd5e.spellLists already up to date ({len(merged)})")
        return
    flags["spellLists"] = merged
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  registered {len(uuids)} spell lists in module.json flags.dnd5e.spellLists")


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"upstream source not found: {SRC}\n"
                         "clone WC5E/Warcraft-5e-Conversion as a sibling directory")
    lists = parse_lists(SRC)
    idx = load_indexes()
    idents = class_identifiers()

    jid = make_id("journal", "wc5e-spell-lists")
    pages, report, missing_records = [], [], {}
    sort = 100000
    for cls in sorted(lists):
        ident = idents.get(cls)
        if not ident:
            report.append((cls, None, 0, 0, [f"no class document with this name"]))
            continue
        entries = dict(lists[cls])
        for name, lvl in EXTRA_ENTRIES.get(ident, []):
            entries.setdefault(lvl, []).append((name, "custom"))
        uuids, missing, seen = [], [], set()
        for level in sorted(entries):
            for name, kind in entries[level]:
                key = squash(name)
                key = ALIAS.get(key, key)
                if key in seen:
                    continue
                seen.add(key)
                uuid = idx.get(key)
                if uuid:
                    uuids.append(uuid)
                else:
                    missing.append((name, kind if kind != "srd" else "not in SRD"))
        pg = page(jid, cls, ident, uuids, missing, sort)
        pages.append(pg)
        if missing:
            missing_records[f"{jid}.{pg['_id']}"] = {
                "name": pg["name"],
                "identifier": ident,
                "pack": "spell-lists",
                "spells": sorted(
                    ({"name": spell_embed._display(n), "key": spell_embed._norm(n), "source": m}
                     for n, m in missing),
                    key=lambda s: s["key"]),
            }
        sort += 100000
        report.append((cls, ident, len(uuids), len(missing), [m[0] for m in missing]))

    entry = {
        "_id": jid,
        "name": "WC5E Class Spell Lists",
        "pages": pages,
        "folder": None,
        "sort": 0,
        "ownership": {"default": 0},
        "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!journal!{jid}",
    }

    out_dir = os.path.join(REPO, "src", "spell-lists")
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(out_dir, fn))
    with open(os.path.join(out_dir, "spell-lists.json"), "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)

    register_in_manifest(jid, pages)
    missing_spells.set_spell_lists(jid, missing_records)

    tot_res = sum(r[2] for r in report)
    tot_mis = sum(r[3] for r in report)
    print(f"Wrote {len(pages)} class spell lists to {out_dir}")
    print(f"  {tot_res} spells linked | {tot_mis} omitted (non-SRD, listed in each page)\n")
    for cls, ident, res, mis, names in report:
        print(f"  {cls:14s} {str(ident):20s} {res:3d} linked  {mis:2d} omitted")
        if names:
            print(f"      omitted: {', '.join(sorted(set(names))[:12])}"
                  + (" …" if len(set(names)) > 12 else ""))


if __name__ == "__main__":
    main()
