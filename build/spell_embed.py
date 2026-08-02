#!/usr/bin/env python3
"""spell_embed.py -- Bake spells onto caster monsters at build time.

For each monster with a Spellcasting / Innate Spellcasting trait: set the
spellcasting ability, spell slots, and a spell-DC bonus so the printed statblock
DC is honoured, then embed the referenced spells that we can resolve to real
items (WC5E custom pack + dnd5e SRD, both CC-BY/homebrew). Unresolved spells
(non-SRD: Tasha's/Xanathar's) stay listed in the trait text.

Imported and called by build_actors.py. Schema verified against dnd5e 5.3.3
(guardian-naga = prepared caster, drider = innate caster).
"""
import json
import os
import re
import copy
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def _mkid(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))

ABILITY_FULL = {"strength": "str", "dexterity": "dex", "constitution": "con",
                "intelligence": "int", "wisdom": "wis", "charisma": "cha"}

# source typos / name variants -> canonical index key
ALIAS = {
    "call lighting": "call lightning", "lighting blast": "lightning blast",
    "produce flames": "produce flame", "produce flame": "produce flame",
    "detect poison and decease": "detect poison and disease",
    "locate animals and plants": "locate animals or plants",
    "ray of sickeness": "ray of sickness",
    "maximilians earthen grasp": "maximilian's earthen grasp",
    "crusaders mantle": "crusader's mantle",
    # Found by running the auto-assign tool against a real collection: these
    # five looked unshippable purely because the source spells them oddly.
    # The first two are SRD, so aliasing them means they now embed at build
    # time and ship to everyone instead of needing the runtime tool.
    "thunder wave": "thunderwave",
    "prot. from evil and good": "protection from evil and good",
    # Non-SRD, so still runtime-only -- but now under a name that matches.
    "thunder step ^xge": "thunder step",      # unpaired ^ marker in the source
    "summon shadow- spawn": "summon shadowspawn",   # line-break hyphen
    "tasha's otherworldy guise": "tasha's otherworldly guise",   # source typo
}


def _display(n):
    """The name as a human should read it: source markup gone, case kept.

    _norm() produces the lookup key and lowercases; this produces what the
    auto-assign report shows a GM, so `*cause fear* ^XGE^` reads as
    `cause fear` rather than being pasted into a shopping list verbatim.
    Note the caret group is optional-closing: the source has at least one
    unpaired marker (`Thunder Step ^XGE`).
    """
    n = re.sub(r"\^[A-Za-z]+\^?", "", n)
    n = n.replace("\u2726", "").replace("*", "")
    n = re.sub(r"</?br\s*/?>", "", n)
    n = re.sub(r"\s+", " ", n)
    return n.strip(" .:;-")


def _norm(n):
    n = n.lower()
    n = re.sub(r"\^[a-z]+\^", "", n)
    n = n.replace("✦", "").replace("*", "")
    n = re.sub(r"\([^)]*\)", "", n)
    n = re.sub(r"</?br\s*/?>", "", n)
    # Strip zero-width characters (BOM, ZWSP, ZWNJ, ZWJ) that survive from
    # Homebrewery/GMBinder/PDF extraction. JS's \s matches U+FEFF but Python's
    # re \s does not (and neither matches U+200B/C/D), so this is an explicit
    # strip on both sides rather than relying on differing \s semantics --
    # keep scripts/auto-assign/manifest.mjs's normaliseName() in step with
    # this.
    n = re.sub(r"[﻿​‌‍]", "", n)
    n = re.sub(r"\s+", " ", n)
    n = n.strip(" .:;-")
    return ALIAS.get(n, n)


# Mis-split statblock fragments seen during this build; reported by build_actors.
DROPPED = []

_CUSTOM = None
_SRD = None

def load_indexes():
    global _CUSTOM, _SRD
    if _CUSTOM is not None:
        return _CUSTOM, _SRD
    _CUSTOM = {}
    for fn in os.listdir(os.path.join(REPO, "src", "spells")):
        # "_folder-*.json" are compendium folder documents, not spells: they have
        # no img/system and would blow up the index.
        if fn.endswith(".json") and not fn.startswith("_folder-"):
            d = json.load(open(os.path.join(REPO, "src", "spells", fn), encoding="utf-8"))
            _CUSTOM[_norm(d["name"])] = {"name": d["name"], "img": d["img"],
                                         "system": d["system"], "src": "custom"}
    srd_path = os.path.join(HERE, "data", "srd_spells_2014.json")
    raw = json.load(open(srd_path, encoding="utf-8"))
    _SRD = {}
    for k, v in raw.items():
        _SRD[_norm(k)] = {"name": v["name"], "img": v.get("img"),
                          "system": v["system"], "src": "srd"}
    return _CUSTOM, _SRD


# ---------------------------------------------------------------------------
# Parse the spellcasting trait
# ---------------------------------------------------------------------------
HEADER = re.compile(
    r"(?P<cantrip>Cantrips?\s*\(at will\))"
    r"|(?P<lvl>(?P<lvlnum>\d)(?:st|nd|rd|th)\s+level\s*\((?P<slotnum>\d+)\s*slots?\))"
    r"|(?P<atwill>At will)"
    r"|(?P<perday>(?P<perdaynum>\d+)\s*/\s*day(?:\s+each)?)"
    , re.IGNORECASE)


def parse_spellcasting(text):
    m_ab = re.search(r"spellcasting ability is (\w+)", text, re.IGNORECASE)
    if not m_ab:
        return None
    ability = ABILITY_FULL.get(m_ab.group(1).lower())
    if not ability:
        return None
    dc = None
    m_dc = re.search(r"spell save DC\s*(\d+)", text, re.IGNORECASE)
    if m_dc:
        dc = int(m_dc.group(1))

    # locate groups
    groups = []
    matches = list(HEADER.finditer(text))
    for i, mm in enumerate(matches):
        start = mm.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]
        # Keep the original spelling alongside the lookup key: the key is
        # lowercased for matching, but the raw name is what a human reads in
        # the auto-assign report.
        pairs = [(_display(x), _norm(x)) for x in re.split(r"[,;]", body)]
        # Only drop obvious intro-prose fragments. NOT "the "/"of" etc. — those
        # occur in real spell names (Spare the Dying, Light of the Protector).
        # Non-spell tokens simply won't match an index and fall through as
        # unresolved, so the filter can stay minimal. A colon means the source
        # line was mis-split and the fragment spans two statblock groups.
        BAD = ("spellcast", "following", "innately", "material component")
        names = [(raw, key) for raw, key in pairs
                 if 3 <= len(key) <= 45 and ":" not in key
                 and not any(w in key for w in BAD)]
        # A colon means the source line was mis-split across two statblock
        # groups. Those must not reach the manifest, but they must not vanish
        # silently either: the fragment usually hides a real spell name (the
        # known case buries "arms of hadar"), and the underlying cause is a
        # pact-magic header HEADER cannot match. Collected for the build report.
        DROPPED.extend(key for _raw, key in pairs
                       if ":" in key and 3 <= len(key) <= 45
                       and not any(w in key for w in BAD))
        if not names:
            continue
        if mm.group("cantrip"):
            groups.append({"prep": "prepared", "level": 0, "slots": None,
                           "names": names})
        elif mm.group("lvl"):
            lvl = int(mm.group("lvlnum")); slots = int(mm.group("slotnum"))
            groups.append({"prep": "prepared", "level": lvl, "slots": slots,
                           "names": names})
        elif mm.group("atwill"):
            groups.append({"prep": "atwill", "level": None, "slots": None,
                           "names": names})
        elif mm.group("perday"):
            groups.append({"prep": "innate", "per_day": int(mm.group("perdaynum")),
                           "level": None, "slots": None, "names": names})
    return {"ability": ability, "dc": dc, "groups": groups}


# ---------------------------------------------------------------------------
# Embed
# ---------------------------------------------------------------------------
def _embed_item(actor_id, entry, prep, per_day, sort):
    item_id = _mkid(actor_id, "spell", entry["name"])
    system = copy.deepcopy(entry["system"])
    system["preparation"] = {"mode": prep, "prepared": prep == "prepared"}
    if prep == "innate" and per_day:
        system["uses"] = {"max": str(per_day), "spent": 0,
                          "recovery": [{"period": "day", "type": "recoverAll"}]}
    system.setdefault("source", {})
    return {
        "_id": item_id, "name": entry["name"], "type": "spell",
        "img": entry["img"] or "icons/svg/daze.svg", "system": system,
        "effects": [], "folder": None, "sort": sort, "ownership": {"default": 0},
        "flags": {}, "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!actors.items!{actor_id}.{item_id}",
    }


def embed_spellcasting(actor, mon, actor_id, prof, ability_mod_fn):
    """Mutate `actor` in place. Returns (matched:int, unmatched:list[dict])."""
    trait_text = None
    for t in mon["traits"]:
        if "spellcasting" in t["name"].lower():
            trait_text = t["text"]; break
    if not trait_text:
        return 0, []

    parsed = parse_spellcasting(trait_text)
    if not parsed:
        return 0, []

    custom, srd = load_indexes()
    ability = parsed["ability"]

    # actor spellcasting ability
    actor["system"]["attributes"]["spellcasting"] = ability

    # spell slots (prepared casters only)
    slots = {}
    for g in parsed["groups"]:
        if g["prep"] == "prepared" and g["level"] and g["slots"]:
            slots[f"spell{g['level']}"] = {"value": g["slots"], "override": None}
    if slots:
        actor["system"]["spells"] = slots

    # DC bonus so the printed statblock DC is honoured
    if parsed["dc"] is not None:
        derived = 8 + prof + ability_mod_fn(mon["abilities"].get(ability, 10))
        delta = parsed["dc"] - derived
        actor["system"].setdefault("bonuses", {})
        actor["system"]["bonuses"]["spell"] = {"dc": str(delta) if delta else ""}

    # embed matched spells
    matched, unmatched, seen = 0, [], set()
    sort = 200000
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
            per_day = g.get("per_day")
            actor["items"].append(
                _embed_item(actor_id, entry, g["prep"], per_day, sort))
            sort += 1000
            matched += 1
    return matched, unmatched
