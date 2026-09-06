#!/usr/bin/env python3
"""
build_backgrounds.py -- Build the WC5E backgrounds from the Heroes Handbook into
src/generated/backgrounds/ as dnd5e 5.3.3 `background` items plus their feature `feat`s.

Source: "Heroes Handbook, Main File.txt", the `## New Backgrounds` part of
"Chapter 3: Personality & Background". Each background is a `### <Name>` section
holding flavour prose, a block of `<br> **Skill Proficiencies:** ...` lines, a
`#### Feature: <Name>` section, and `#### Suggested Characteristics` with d8/d6
roll tables.

A dnd5e background drives the character sheet through `system.advancement`:
  * Trait with `grants: ["skills:dec", ...]`            -> fixed skill proficiencies
  * Trait with `choices: [{count: n, pool: [...]}]`     -> "one of your choice"
  * ItemGrant titled "Feature"                          -> the background's feature
Trait key formats verified against dnd5e 5.3.3: `skills:<abbr>`, `languages:*`,
`tool:forg`, and the namespaced `tool:art:*` / `tool:music:*`.

Starting equipment IS wired, from the `EQUIPMENT` table below. dnd5e wants typed
entries under an AND group -- `linked` for a specific item UUID, `tool` for a
category like artisan's tools -- plus `wealth` as a bare gp string. The shape was
copied from a working 2024 SRD background (Soldier) rather than guessed, and every
UUID is resolved from a committed index so the build needs no Foundry install.

The equipment line stays in the description too: a couple of entries have no dnd5e
equivalent ("a hooded cloak") and the prose also carries the flavour ("a trinket of
your faction"), which the picker can't express.
"""
import json
import os
import re
import hashlib

import folders

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(REPO), "Warcraft-5e-Conversion",
                   "Heroes Handbook, Main File.txt")

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

SKILLS = {
    "acrobatics": "acr", "animal handling": "ani", "arcana": "arc",
    "athletics": "ath", "deception": "dec", "history": "his", "insight": "ins",
    "intimidation": "itm", "investigation": "inv", "medicine": "med",
    "nature": "nat", "perception": "prc", "performance": "prf",
    "persuasion": "per", "religion": "rel", "sleight of hand": "slt",
    "stealth": "ste", "survival": "sur",
}
# Named tool kits use flat ids; artisan tools and instruments are namespaced.
TOOLS = {
    "forgery kit": "tool:forg", "disguise kit": "tool:disg",
    "herbalism kit": "tool:herb", "navigator's tools": "tool:navg",
    "poisoner's kit": "tool:pois", "thieves' tools": "tool:thief",
}

# The Homebrewery source has hyphenation baked into the prose ("organi-zation"),
# mid-line rather than at line ends, so joining lines can't undo it. Blanket
# de-hyphenation would wreck real compounds like "self-mastery", so fix the known
# artifacts and report anything new rather than shipping it silently.
DEHYPHEN = {"organi-zation": "organization", "know-ledge": "knowledge",
            "profi-ciency": "proficiency", "back-ground": "background",
            "equip-ment": "equipment", "sugges-tions": "suggestions"}
LEGITIMATE_HYPHENS = {"self-mastery", "half-orc", "half-elf", "well-known",
                      "high-quality"}


def clean(t):
    t = t.replace("&nbsp;", " ").replace(" ", " ")
    t = t.replace("&shy;", "").replace("­", "")
    for bad, good in DEHYPHEN.items():
        t = t.replace(bad, good).replace(bad.capitalize(), good.capitalize())
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"<div[^>]*>|</div>|<img[^>]*>|\\pagebreakNum|\\columnbreak", "", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def md_html(t):
    t = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)


def parse(path):
    """-> list of dicts, one per background."""
    lines = open(path, encoding="utf-8").read().split("\n")
    # bound the search to the New Backgrounds part of chapter 3
    start = next(i for i, l in enumerate(lines) if l.strip() == "## New Backgrounds")
    end = next(i for i, l in enumerate(lines[start:], start)
               if re.match(r"^\s*# Chapter 4", l))
    out, cur, section = [], None, None
    for raw in lines[start:end]:
        s = raw.strip()
        m = re.match(r"^###\s+(?!#)(.+?)\s*$", s)
        if m:
            cur = {"name": clean(m.group(1)), "flavor": [], "profs": {},
                   "feature_name": "", "feature": [], "characteristics": [],
                   "tables": []}
            out.append(cur)
            section = "flavor"
            continue
        if cur is None:
            continue
        fm = re.match(r"^####\s+Feature:\s*(.+?)\s*$", s)
        if fm:
            cur["feature_name"] = clean(fm.group(1))
            section = "feature"
            continue
        if re.match(r"^####\s+Suggested Characteristics", s):
            section = "characteristics"
            continue
        if s.startswith("####"):
            section = None
            continue
        # "<br> **Skill Proficiencies:** Deception, Insight"
        pm = re.match(r"^(?:<br\s*/?>)?\s*\*\*(.+?):\*\*\s*(.*)$", s)
        if pm and section in ("flavor", None):
            cur["profs"][pm.group(1).strip().lower()] = clean(pm.group(2))
            continue
        if s.startswith("|"):
            cur["tables"].append(s)
            continue
        body = clean(s)
        if not body or body.startswith(("\\", "<")):
            continue
        if section == "flavor":
            cur["flavor"].append(body)
        elif section == "feature":
            cur["feature"].append(body)
        elif section == "characteristics":
            cur["characteristics"].append(body)
    return [b for b in out if b["profs"]]


def tables_html(rows):
    """Markdown roll tables -> HTML tables, dropping alignment rows."""
    html, buf = [], []

    def flush():
        if not buf:
            return
        head, *body = buf
        cells = [c.strip() for c in head.strip("|").split("|")]
        cells = [c for c in cells if c]
        th = "".join(f"<th>{md_html(c)}</th>" for c in cells)
        trs = []
        for r in body:
            cs = [c.strip() for c in r.strip("|").split("|")]
            cs = [c for c in cs if c]
            if not cs:
                continue
            trs.append("".join(f"<td>{md_html(c)}</td>" for c in cs))
        rows_html = "".join(f"<tr>{x}</tr>" for x in trs)
        html.append(f"<table><thead><tr>{th}</tr></thead><tbody>{rows_html}</tbody></table>")
        buf.clear()

    for r in rows:
        r = clean(r)
        if re.match(r"^\|[\s:|-]+\|?$", r):      # |:---:|:-|
            continue
        if not r.startswith("|"):
            flush()
            continue
        buf.append(r)
    flush()
    return "".join(html)


def build_advancement(bg, feature_uuid):
    adv = []
    profs = bg["profs"]

    skills = [SKILLS[s] for s in
              (x.strip().lower() for x in profs.get("skill proficiencies", "").split(","))
              if s in SKILLS]
    if skills:
        adv.append({
            "_id": make_id(bg["name"], "trait", "skills"), "type": "Trait",
            "configuration": {"mode": "default", "allowReplacements": True,
                              "grants": [f"skills:{s}" for s in skills], "choices": []},
            "value": {}, "level": 0, "title": "", "icon": "", "classRestriction": "",
        })

    tool_line = profs.get("tool proficiencies", "")
    grants, choices = [], []
    if tool_line:
        low = tool_line.lower()
        for name, key in TOOLS.items():
            if name in low:
                grants.append(key)
        # "One type of artisan's tools", "one type of musical instrument"
        if "artisan" in low:
            choices.append({"count": 1, "pool": ["tool:art:*"]})
        if "musical instrument" in low:
            choices.append({"count": 1, "pool": ["tool:music:*"]})
    if grants or choices:
        adv.append({
            "_id": make_id(bg["name"], "trait", "tools"), "type": "Trait",
            "configuration": {"mode": "default", "allowReplacements": False,
                              "grants": grants, "choices": choices},
            "value": {}, "level": 0, "title": "Tool Proficiency" if choices else "",
            "icon": "", "classRestriction": "",
        })

    lang = profs.get("languages", "")
    if lang:
        n = 2 if re.match(r"\s*two\b", lang, re.IGNORECASE) else 1
        adv.append({
            "_id": make_id(bg["name"], "trait", "langs"), "type": "Trait",
            "configuration": {"mode": "default", "allowReplacements": False,
                              "grants": [], "choices": [{"count": n, "pool": ["languages:*"]}]},
            "value": {}, "level": 0, "title": "Languages", "icon": "", "classRestriction": "",
        })

    adv.append({
        "_id": make_id(bg["name"], "grant", "feature"), "type": "ItemGrant",
        "configuration": {"items": [{"uuid": feature_uuid, "optional": False}],
                          "optional": False,
                          "spell": {"ability": [], "preparation": "",
                                    "uses": {"max": "", "per": ""}}},
        "value": {}, "level": 0, "title": "Feature", "icon": "", "classRestriction": "",
    })
    return adv


SRC_META = {"custom": "Warcraft 5e - Heroes Handbook",
            "book": "Warcraft 5e - Heroes Handbook", "page": "",
            "license": "", "revision": 1, "rules": "2014"}

# Starting equipment, transcribed from each background's Equipment line.
#   ("<dnd5e item name>", count)  -> a `linked` entry, resolved via
#                                   reference/srd-index/srd_item_ids.json
#   ("tool:<key>", None)          -> a `tool` entry for a whole category, the way
#                                   dnd5e's Soldier uses key "game" for a gaming set
# `gp` becomes system.wealth. Items with no dnd5e equivalent (a hooded cloak) are
# left to the description rather than approximated with something else.
EQUIPMENT = {
    "Double Agent": {"gp": 15, "items": [
        ("Forgery Kit", None), ("Dagger", None), ("Chalk", 2), ("Parchment", 4),
        ("Ink Bottle", None), ("Ink Pen", None), ("Traveler's Clothes", None),
        ("Pouch", None)]},
    "Faction Fostered": {"gp": 10, "items": [
        ("Common Clothes", None), ("Trinket", None), ("Book", None),
        ("Ink Bottle", None), ("Ink Pen", None), ("Pouch", None)]},
    "Kirin Tor Apprentice": {"gp": 15, "items": [
        ("Ink Bottle", None), ("Ink Pen", None), ("Chalk", None),
        ("Scroll Case", None), ("Parchment", 5), ("Robes", None),
        ("Candle", None), ("Tinderbox", None), ("Pouch", None)]},
    "Tribal Member": {"gp": 10, "items": [
        ("Traveler's Clothes", None), ("tool:art", None), ("tool:music", None),
        ("Trinket", None), ("Pouch", None)]},
}


def item_index():
    path = os.path.join(REPO, "reference", "srd-index", "srd_item_ids.json")
    return json.load(open(path, encoding="utf-8"))


def starting_equipment(bg_name, idx, report):
    """-> (entries, wealth) in dnd5e's startingEquipment shape."""
    spec = EQUIPMENT.get(bg_name)
    if not spec:
        return [], ""
    root = make_id(bg_name, "equip", "root")
    entries = [{"type": "AND", "requiresProficiency": False, "_id": root,
                "group": "", "sort": 100000}]
    sort = 200000
    for name, count in spec["items"]:
        entry = {"type": None, "count": count, "key": None,
                 "requiresProficiency": False,
                 "_id": make_id(bg_name, "equip", name), "group": root, "sort": sort}
        if name.startswith("tool:"):
            entry["type"] = "tool"
            entry["key"] = name.split(":", 1)[1]
        else:
            ref = idx.get(name)
            if not ref:
                report.append(f"{bg_name}: no dnd5e item named {name!r} -- left to the description")
                continue
            pack, _id = ref.split(".", 1)
            entry["type"] = "linked"
            entry["key"] = f"Compendium.dnd5e.{pack}.Item.{_id}"
        entries.append(entry)
        sort += 100000
    return entries, str(spec["gp"])


def description(bg):
    parts = [f"<p>{md_html(p)}</p>" for p in bg["flavor"]]
    order = ["skill proficiencies", "tool proficiencies", "languages", "equipment"]
    items = [f"<li><strong>{k.title()}:</strong> {md_html(bg['profs'][k])}</li>"
             for k in order if bg["profs"].get(k)]
    if items:
        parts.append(f"<ul>{''.join(items)}</ul>")
    if bg["feature_name"]:
        parts.append(f"<h3>Feature: {bg['feature_name']}</h3>")
        parts += [f"<p>{md_html(p)}</p>" for p in bg["feature"]]
    if bg["characteristics"] or bg["tables"]:
        parts.append("<h3>Suggested Characteristics</h3>")
        parts += [f"<p>{md_html(p)}</p>" for p in bg["characteristics"]]
        parts.append(tables_html(bg["tables"]))
    return "".join(parts)


def wrap(doc_id, name, itype, img, system, folder):
    return {
        "_id": doc_id, "name": name, "type": itype, "img": img, "system": system,
        "effects": [], "folder": folder, "sort": 0, "ownership": {"default": 0},
        "flags": {}, "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!items!{doc_id}",
    }


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"upstream source not found: {SRC}\n"
                         "clone WC5E/Warcraft-5e-Conversion as a sibling directory")
    bgs = parse(SRC)
    idx = item_index()
    equip_report = []
    out_dir = os.path.join(REPO, "src", "generated", "backgrounds")
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(out_dir, fn))

    f_bg = folders.fid("Item", "Backgrounds")
    f_ft = folders.fid("Item", "Background Features")
    docs = []
    for bg in bgs:
        feat_id = make_id("bgfeature", bg["name"])
        feat_uuid = f"Compendium.wc5e-foundryvtt.backgrounds.Item.{feat_id}"
        bg_id = make_id("background", bg["name"])

        docs.append(wrap(bg_id, bg["name"], "background", "icons/svg/book.svg", {
            "description": {"value": description(bg), "chat": ""},
            "identifier": slugify(bg["name"]),
            "source": dict(SRC_META),
            "advancement": build_advancement(bg, feat_uuid),
            **dict(zip(("startingEquipment", "wealth"),
                       starting_equipment(bg["name"], idx, equip_report))),
            "type": {"value": "", "subtype": ""},
        }, f_bg))

        docs.append(wrap(feat_id, bg["feature_name"] or f"{bg['name']} Feature",
                         "feat", "icons/svg/book.svg", {
            "description": {"value": "".join(f"<p>{md_html(p)}</p>" for p in bg["feature"]),
                            "chat": ""},
            "identifier": slugify(bg["feature_name"] or bg["name"]),
            "source": dict(SRC_META),
            "type": {"value": "background", "subtype": ""},
            "properties": [], "requirements": bg["name"],
            "prerequisites": {"level": None},
            "activities": {}, "uses": {"spent": 0, "max": "", "recovery": []},
        }, f_ft))

    for name, fid in (("Backgrounds", f_bg), ("Background Features", f_ft)):
        docs.append(folders.folder_doc("Item", name))

    for d in docs:
        fn = ("_folder-" + slugify(d["name"]) if d.get("type") == "Item"
              else slugify(d["name"]) + ("-feature" if d["type"] == "feat" else ""))
        with open(os.path.join(out_dir, fn + ".json"), "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)

    # Surface hyphenation the DEHYPHEN table doesn't know about; upstream text
    # changes would otherwise quietly ship "organi-zation"-style artifacts.
    suspect = set()
    for d in docs:
        val = (d.get("system") or {}).get("description", {}).get("value", "")
        for tok in re.findall(r"\b[a-zA-Z]+-[a-z]{2,}\b", re.sub(r"<[^>]+>", " ", val)):
            if tok.lower() not in LEGITIMATE_HYPHENS:
                suspect.add(tok)

    print(f"Wrote {len(bgs)} backgrounds (+{len(bgs)} features) to {out_dir}")
    for bg in bgs:
        adv = build_advancement(bg, "x")
        kinds = [a["type"] + (f"({len(a['configuration'].get('grants') or [])}g/"
                              f"{sum(c['count'] for c in a['configuration'].get('choices') or [])}c)"
                              if a["type"] == "Trait" else "") for a in adv]
        print(f"  {bg['name']:22s} feature={bg['feature_name']!r}")
        print(f"      {', '.join(kinds)}")
        missing = [k for k in ("skill proficiencies", "equipment") if not bg["profs"].get(k)]
        if missing:
            print(f"      !! missing: {missing}")
    if equip_report:
        print("\n  equipment notes:")
        for r in equip_report:
            print(f"    {r}")
    if suspect:
        print(f"\n  !! unrecognised hyphenation (add to DEHYPHEN or LEGITIMATE_HYPHENS): "
              f"{', '.join(sorted(suspect))}")


if __name__ == "__main__":
    main()
