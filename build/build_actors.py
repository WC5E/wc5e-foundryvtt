#!/usr/bin/env python3
"""
build_actors.py -- Convert intermediate/monsters.json into dnd5e 5.3.3 NPC actor
documents, one JSON file per monster in src/monsters/, ready for the Foundry CLI
to compile into a LevelDB compendium pack.

Schema verified against foundryvtt/dnd5e release-5.3.3 source (data models +
SRD monster source, e.g. packs/_source/monsters/giant/ogre.yml).

Design choices:
  * Core stats (abilities, ac, hp, movement, senses, cr, type, size, alignment,
    di/dr/dv/ci, languages, saves, skills) are written to exact schema.
  * Every trait/action/reaction/legendary becomes a `feat` item whose
    description carries the full statblock text (never lossy).
      - passive traits: feat with properties:["trait"]  -> "Traits" section
      - attacks: feat + attack activity (flat to-hit, exact damage parts)
      - other actions: feat + utility activity (so it lands in the right
        section and is usable), full text in the description
  * Legendary action count -> system.resources.legact.max, options each become
    a legendary-activation feat.
"""
import json
import os
import re
import hashlib

import spell_embed
import folders
import missing_spells

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# Shared default token/portrait shipped with the module.
DEFAULT_IMG = "modules/wc5e-foundryvtt/assets/default-token.svg"

# Aggregated spell-embedding report, filled during build_actor().
SPELL_REPORT = []

# Compendium folder (by creature type) + a themed colour per type.
TYPE_FOLDER = {
    "aberration": ("Aberrations", "#6b3fa0"), "beast": ("Beasts", "#6b8e23"),
    "celestial": ("Celestials", "#d4af37"), "construct": ("Constructs", "#8a8a8a"),
    "dragon": ("Dragons", "#b22222"), "elemental": ("Elementals", "#1e90ff"),
    "fey": ("Fey", "#c71585"), "fiend": ("Fiends", "#8b0000"),
    "giant": ("Giants", "#8b5a2b"), "humanoid": ("Humanoids", "#4682b4"),
    "monstrosity": ("Monstrosities", "#556b2f"), "ooze": ("Oozes", "#6b8e23"),
    "plant": ("Plants", "#2e8b57"), "undead": ("Undead", "#4b0082"),
}
USED_MONSTER_FOLDERS = {}

# ---------------------------------------------------------------------------
# Deterministic 16-char Foundry document ids (stable across rebuilds)
# ---------------------------------------------------------------------------
_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*parts):
    h = hashlib.sha1("::".join(str(p) for p in parts).encode("utf-8")).digest()
    n = int.from_bytes(h, "big")
    out = []
    for _ in range(16):
        out.append(_B62[n % 62])
        n //= 62
    return "".join(out)


# ---------------------------------------------------------------------------
# Small lookups
# ---------------------------------------------------------------------------
SIZE_MAP = {"tiny": "tiny", "small": "sm", "medium": "med",
            "large": "lg", "huge": "huge", "gargantuan": "grg"}
TOKEN_SIZE = {"tiny": 1, "sm": 1, "med": 1, "lg": 2, "huge": 3, "grg": 4}


def _source_book(mon):
    """The source book name, which goes in BOTH `book` and `custom`.

    dnd5e derives `system.source.value` -- what the compendium browser's source
    filter groups and matches on -- as `book || <package title>`. It never looks
    at `custom`; that only sets the display label. So a document with a custom
    source and an empty book falls through to the module's title, which is not one
    of the keys in `flags.dnd5e.sourceBooks`, and the filter entry it produces
    matches nothing.
    """
    return "Warcraft 5e - Manual of Monsters" + (" (WIP)" if mon.get("_wip") else "")

CREATURE_TYPES = {"aberration", "beast", "celestial", "construct", "dragon",
                  "elemental", "fey", "fiend", "giant", "humanoid",
                  "monstrosity", "ooze", "plant", "undead"}

DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning",
                "necrotic", "piercing", "poison", "psychic", "radiant",
                "slashing", "thunder"]

CONDITION_STEMS = {
    "blind": "blinded", "charm": "charmed", "deaf": "deafened",
    "exhaust": "exhaustion", "fright": "frightened", "grappl": "grappled",
    "incapacit": "incapacitated", "invisib": "invisible", "paraly": "paralyzed",
    "petrif": "petrified", "pretrif": "petrified", "poison": "poisoned",
    "prone": "prone", "restrain": "restrained", "stun": "stunned",
    "unconsci": "unconscious", "diseas": "diseased",
}


def prof_bonus(cr):
    if cr is None:
        return 2
    if cr < 5:   return 2
    if cr < 9:   return 3
    if cr < 13:  return 4
    if cr < 17:  return 5
    if cr < 21:  return 6
    if cr < 25:  return 7
    if cr < 29:  return 8
    return 9


def ability_mod(score):
    return (score - 10) // 2


def md_to_html(text):
    """Markdown ***/**/* to HTML, wrapped in a paragraph."""
    t = text or ""
    t = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)
    t = t.strip()
    return f"<p>{t}</p>" if t else ""


# ---------------------------------------------------------------------------
# Trait mapping (damage / conditions)
# ---------------------------------------------------------------------------
def map_damage(raw):
    """'bludgeoning, piercing, and slashing from nonmagical attacks' ->
    (value_list, bypasses_list, custom_str)."""
    if not raw:
        return [], [], ""
    t = raw.lower()
    bypasses = []
    if "nonmagical" in t or "non-magical" in t:
        bypasses.append("mgc")
    if "silver" in t:
        bypasses.append("sil")
    if "adamantine" in t:
        bypasses.append("ada")
    value = [d for d in DAMAGE_TYPES if re.search(r"\b" + d, t)]
    # de-dup, keep order
    seen = set(); value = [v for v in value if not (v in seen or seen.add(v))]
    custom = ""
    if not value:
        # nothing standard recognised -> preserve verbatim
        custom = raw
    return value, bypasses, custom


def map_conditions(raw):
    if not raw:
        return [], ""
    t = raw.lower()
    found = []
    for stem, key in CONDITION_STEMS.items():
        if stem in t and key not in found:
            found.append(key)
    custom = "" if found else raw
    return found, custom


def _norm_creature_type(word):
    """Return a canonical creature-type key or None ('beasts' -> 'beast')."""
    w = word.strip().lower()
    if w in CREATURE_TYPES:
        return w
    if w.endswith("s") and w[:-1] in CREATURE_TYPES:
        return w[:-1]
    return None


def map_type(mon):
    t = (mon["type"] or "").strip().lower()

    # Swarms: "swarm of Tiny beasts" -> value=beast, swarm=<size key>
    m = re.match(r"swarm of (\w+)\s+(\w+)", t)
    if m:
        swarm_size = SIZE_MAP.get(m.group(1), "tiny")
        inner = _norm_creature_type(m.group(2))
        if inner:
            return {"value": inner, "subtype": mon["subtype"],
                    "swarm": swarm_size, "custom": ""}
        return {"value": "custom", "subtype": mon["subtype"],
                "swarm": swarm_size, "custom": m.group(2).title()}

    canon = _norm_creature_type(t)
    if canon:
        return {"value": canon, "subtype": mon["subtype"], "swarm": "", "custom": ""}
    return {"value": "custom", "subtype": mon["subtype"], "swarm": "",
            "custom": (mon["type"] or "").title()}


# ---------------------------------------------------------------------------
# Attack-text parsing
# ---------------------------------------------------------------------------
ATTACK_RE = re.compile(
    r"(?P<melee>Melee|Ranged)(?:\s+or\s+(?P<other>Melee|Ranged))?\s+"
    r"(?P<cls>Weapon|Spell)\s+Attack\s*:", re.IGNORECASE)
TOHIT_RE = re.compile(r"([+-]?\d+)\s+to hit", re.IGNORECASE)
REACH_RE = re.compile(r"reach\s+(\d+)\s*ft", re.IGNORECASE)
RANGE_RE = re.compile(r"range\s+(\d+)(?:/(\d+))?\s*ft", re.IGNORECASE)
# e.g. "15 (3d6 + 5) bludgeoning damage"  or  "7 (2d6) fire damage"
DMG_RE = re.compile(
    r"(\d+)\s*\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s*(\w+)\s+damage", re.IGNORECASE)
SAVE_RE = re.compile(
    r"DC\s*(\d+)\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)"
    r"\s+saving throw", re.IGNORECASE)
ABILITY_NAME = {"strength": "str", "dexterity": "dex", "constitution": "con",
                "intelligence": "int", "wisdom": "wis", "charisma": "cha"}


def parse_damage_parts(text):
    parts = []
    for m in DMG_RE.finditer(text):
        _, num, den, sign, bonus, dtype = m.groups()
        b = ""
        if bonus:
            b = f"-{bonus}" if sign == "-" else bonus
        dt = dtype.lower()
        parts.append({
            "number": int(num), "denomination": int(den), "bonus": b,
            "types": [dt] if dt in DAMAGE_TYPES else [],
            "custom": {"enabled": False, "formula": ""},
            "scaling": {"mode": "", "number": 1, "formula": ""},
        })
    return parts


# ---------------------------------------------------------------------------
# Activity + item builders
# ---------------------------------------------------------------------------
def base_activity(actor_id, item_id, kind, activation_type, activation_value=1):
    aid = make_id(actor_id, item_id, "act", kind)
    return {
        "_id": aid,
        "type": kind,
        "activation": {"type": activation_type, "value": activation_value,
                       "condition": "", "override": False},
        "consumption": {"targets": [], "scaling": {"allowed": False, "max": ""},
                        "spellSlot": True},
        "description": {"chatFlavor": ""},
        "duration": {"concentration": False, "value": "", "units": "inst",
                     "special": "", "override": False},
        "effects": [],
        "range": {"value": "", "units": "", "special": "", "override": False},
        "target": {
            "template": {"count": "", "contiguous": False, "type": "", "size": "",
                         "width": "", "height": "", "units": ""},
            "affects": {"count": "", "type": "", "choice": False, "special": ""},
            "prompt": True, "override": False,
        },
        "uses": {"spent": 0, "max": "", "recovery": []},
        "sort": 0,
    }


def build_attack_activity(actor_id, item_id, activation_type, text):
    m = ATTACK_RE.search(text)
    if not m:
        return None
    primary = m.group("melee").lower()
    other = (m.group("other") or "").lower()
    classification = "spell" if m.group("cls").lower() == "spell" else "weapon"

    tohit = TOHIT_RE.search(text)
    bonus = tohit.group(1) if tohit else ""
    if bonus and not bonus.startswith(("+", "-")):
        bonus = bonus  # plain number ok for flat

    # range / reach
    reach = REACH_RE.search(text)
    rng = RANGE_RE.search(text)
    atk_value = "melee" if (primary == "melee" or other == "melee") else "ranged"
    # prefer melee as the base type if it's a "melee or ranged" attack
    if primary == "ranged" and other != "melee":
        atk_value = "ranged"
    elif primary == "melee":
        atk_value = "melee"

    act = base_activity(actor_id, item_id, "attack", activation_type)
    if atk_value == "melee" and reach:
        act["range"] = {"value": reach.group(1), "units": "ft", "special": "",
                        "override": False}
    elif rng:
        long = rng.group(2) or ""
        act["range"] = {"value": rng.group(1), "units": "ft", "special": "",
                        "override": False}
    act["target"]["affects"] = {"count": "1", "type": "creature", "choice": False,
                                "special": ""}
    act["attack"] = {
        "ability": "", "bonus": str(bonus).lstrip("+"),
        "critical": {"threshold": None}, "flat": True,
        "type": {"value": atk_value, "classification": classification},
    }
    act["damage"] = {"critical": {"bonus": ""}, "includeBase": False,
                     "parts": parse_damage_parts(text)}
    return act


def build_save_activity(actor_id, item_id, activation_type, text):
    """Build a rollable save activity for a non-attack ability of the form
    'DC N <ability> saving throw ... N (XdY) <type> damage'. Returns None if it
    doesn't match. The DC is the flat value printed in the statblock."""
    sm = SAVE_RE.search(text)
    if not sm:
        return None
    dc = sm.group(1)
    ability = ABILITY_NAME[sm.group(2).lower()]
    parts = parse_damage_parts(text)   # same "N (XdY) type damage" format
    act = base_activity(actor_id, item_id, "save", activation_type)
    # most monster save abilities deal half on a successful save
    on_save = "half" if (parts and re.search(r"half", text, re.IGNORECASE)) \
        else ("half" if parts else "none")
    # calculation "" (empty) = use the literal DC in `formula`; a truthy value
    # like "flat" would make dnd5e ignore it and compute 8+prof+mod instead.
    act["save"] = {"ability": [ability],
                   "dc": {"calculation": "", "formula": str(dc)}}
    act["damage"] = {"onSave": on_save, "parts": parts}
    return act


def build_feat_item(actor_id, feat, section, sort):
    """section in {'trait','action','bonus','reaction','legendary'}."""
    name = feat["name"] or "Feature"
    text = feat["text"]
    item_id = make_id(actor_id, section, name, sort)

    activities = {}
    properties = []
    activation_type_map = {"action": "action", "bonus": "bonus",
                           "reaction": "reaction", "legendary": "legendary"}

    if section == "trait":
        properties = ["trait"]
    else:
        activation_type = activation_type_map[section]
        # legendary "(Costs N Actions)"
        act_value = 1
        cm = re.search(r"costs?\s+(\d+)\s+action", name + " " + text, re.IGNORECASE)
        if cm:
            act_value = int(cm.group(1))

        act = None
        if ATTACK_RE.search(text):
            act = build_attack_activity(actor_id, item_id, activation_type, text)
        if act is None:
            # non-attack abilities with a save (breath weapons, AoE, save-or-X)
            act = build_save_activity(actor_id, item_id, activation_type, text)
        if act is None:
            act = base_activity(actor_id, item_id, "utility", activation_type,
                                act_value)
        if act_value != 1:
            act["activation"]["value"] = act_value
        activities[act["_id"]] = act

    system = {
        "description": {"value": md_to_html(text), "chat": ""},
        "identifier": "",
        "source": {"custom": "", "book": "", "page": "", "license": "",
                   "revision": 1, "rules": "2014"},
        "activation": {"type": "", "value": None, "condition": ""},
        "duration": {"value": "", "units": ""},
        "cover": None,
        "crewed": False,
        "target": {"template": {"count": "", "contiguous": False, "type": "",
                                "size": "", "width": "", "height": "", "units": ""},
                   "affects": {"count": "", "type": "", "choice": False,
                               "special": ""}},
        "range": {"value": None, "long": None, "units": "", "special": ""},
        "uses": {"spent": 0, "max": "", "recovery": []},
        "type": {"value": "monster", "subtype": ""},
        "requirements": "",
        "properties": properties,
        "prerequisites": {"level": None},
        "activities": activities,
    }

    return {
        "_id": item_id,
        "name": name,
        "type": "feat",
        "img": "icons/svg/item-bag.svg" if section == "trait"
               else "icons/svg/sword.svg",
        "system": system,
        "effects": [],
        "folder": None,
        "sort": sort,
        "ownership": {"default": 0},
        "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!actors.items!{actor_id}.{item_id}",
    }


# ---------------------------------------------------------------------------
# Ability blocks
# ---------------------------------------------------------------------------
def build_abilities(mon, pb):
    out = {}
    saves = mon.get("saves", {})
    for key in ["str", "dex", "con", "int", "wis", "cha"]:
        score = mon["abilities"].get(key, 10)
        entry = {"value": score, "proficient": 0, "max": None,
                 "bonuses": {"check": "", "save": ""}}
        if key in saves:
            entry["proficient"] = 1
            delta = saves[key] - (ability_mod(score) + pb)
            if delta != 0:
                entry["bonuses"]["save"] = str(delta)
        out[key] = entry
    return out


SKILL_ABILITY = {
    "acr": "dex", "ani": "wis", "arc": "int", "ath": "str", "dec": "cha",
    "his": "int", "ins": "wis", "itm": "cha", "inv": "int", "med": "wis",
    "nat": "int", "prc": "wis", "prf": "cha", "per": "cha", "rel": "int",
    "slt": "dex", "ste": "dex", "sur": "wis",
}

def build_skills(mon, pb):
    out = {}
    listed = mon.get("skills", {})
    for key, ab in SKILL_ABILITY.items():
        entry = {"value": 0, "ability": ab,
                 "bonuses": {"check": "", "passive": ""}}
        if key in listed:
            score = mon["abilities"].get(ab, 10)
            mod = ability_mod(score)
            listed_total = listed[key]
            if listed_total == mod + 2 * pb:
                entry["value"] = 2
            else:
                entry["value"] = 1
                delta = listed_total - (mod + pb)
                if delta != 0:
                    entry["bonuses"]["check"] = str(delta)
        out[key] = entry
    return out


# ---------------------------------------------------------------------------
# Actor builder
# ---------------------------------------------------------------------------
def build_actor(mon):
    actor_id = make_id("actor", mon["name"])
    cr = mon["cr"]
    if isinstance(cr, float) and cr.is_integer():
        cr = int(cr)
    pb = prof_bonus(cr)
    size = SIZE_MAP.get(mon["size"], "med")

    dv_v, dv_b, dv_c = map_damage(mon["damage_vulnerabilities"])
    dr_v, dr_b, dr_c = map_damage(mon["damage_resistances"])
    di_v, di_b, di_c = map_damage(mon["damage_immunities"])
    ci_v, ci_c = map_conditions(mon["condition_immunities"])

    # languages -> custom (Warcraft langs aren't standard dnd5e keys)
    lang = mon["languages"].strip()
    lang_custom = "" if lang in ("", "—", "-", "none", "None") else \
        "; ".join(p.strip() for p in lang.split(",") if p.strip())

    sp = mon["speed"]
    sen = mon["senses"]

    # ---- items ----
    items = []
    sort = 100000
    for feat in mon["traits"]:
        items.append(build_feat_item(actor_id, feat, "trait", sort)); sort += 100000
    for feat in mon["actions"]:
        items.append(build_feat_item(actor_id, feat, "action", sort)); sort += 100000
    for feat in mon["reactions"]:
        items.append(build_feat_item(actor_id, feat, "reaction", sort)); sort += 100000

    # legendary: preamble sets the count; options become legendary items
    legact_max = 0
    for feat in mon["legendary"]:
        if not feat["name"]:
            m = re.search(r"take\s+(\d+)\s+legendary", feat["text"], re.IGNORECASE)
            if m:
                legact_max = int(m.group(1))
            continue
        items.append(build_feat_item(actor_id, feat, "legendary", sort)); sort += 100000

    system = {
        "abilities": build_abilities(mon, pb),
        "attributes": {
            "ac": {"flat": mon["ac"], "calc": "natural",
                   "formula": ""},
            "hp": {"value": mon["hp"], "max": mon["hp"], "temp": 0, "tempmax": 0,
                   "formula": mon["hp_formula"]},
            "init": {"ability": "", "bonus": "0",
                     "roll": {"min": None, "max": None, "mode": 0}},
            "movement": {
                "burrow": sp.get("burrow", 0), "climb": sp.get("climb", 0),
                "fly": sp.get("fly", 0), "swim": sp.get("swim", 0),
                "walk": sp.get("walk", 0), "bonus": "", "special": "",
                "units": "ft", "hover": bool(sp.get("hover", False)),
            },
            "attunement": {"max": 3},
            "senses": {
                "ranges": {
                    "darkvision": sen.get("darkvision", 0) or None,
                    "blindsight": sen.get("blindsight", 0) or None,
                    "tremorsense": sen.get("tremorsense", 0) or None,
                    "truesight": sen.get("truesight", 0) or None,
                },
                "units": "ft", "special": "",
            },
            "spellcasting": "",
            "exhaustion": 0,
            "concentration": {"ability": "", "roll": {"min": None, "max": None,
                              "mode": 0}, "bonuses": {"save": ""}, "limit": 1},
            "hd": {"spent": 0},
            "death": {"ability": "", "roll": {"min": None, "max": None, "mode": 0},
                      "success": 0, "failure": 0},
        },
        "details": {
            "biography": {"value": "", "public": ""},
            "alignment": (mon["alignment"] or "").title(),
            "race": None,
            "type": map_type(mon),
            "cr": cr,
            "spellLevel": 0,
        },
        "traits": {
            "size": size,
            "di": {"value": di_v, "bypasses": di_b, "custom": di_c},
            "dr": {"value": dr_v, "bypasses": dr_b, "custom": dr_c},
            "dv": {"value": dv_v, "bypasses": dv_b, "custom": dv_c},
            "ci": {"value": ci_v, "custom": ci_c},
            "languages": {"value": [], "custom": lang_custom},
            "dm": {"amount": {}, "bypasses": []},
        },
        "skills": build_skills(mon, pb),
        "tools": {},
        "resources": {
            "legact": {"value": legact_max, "max": legact_max},
            "legres": {"value": 0, "max": 0},
            "lair": {"value": False, "initiative": None},
        },
        "source": {"custom": _source_book(mon), "book": _source_book(mon),
                   "page": "", "license": "", "revision": 1, "rules": "2014"},
    }

    tsize = TOKEN_SIZE.get(size, 1)
    prototype = {
        "name": mon["name"],
        "displayName": 20,
        "actorLink": False,
        "width": tsize, "height": tsize,
        "disposition": -1,
        "displayBars": 20,
        "bar1": {"attribute": "attributes.hp"},
        "bar2": {"attribute": None},
        "texture": {"src": DEFAULT_IMG},
        "sight": {"enabled": False, "range": 0},
    }

    actor = {
        "_id": actor_id,
        "name": mon["name"],
        "type": "npc",
        "img": DEFAULT_IMG,
        "system": system,
        "prototypeToken": prototype,
        "items": items,
        "effects": [],
        "folder": None,
        "sort": 0,
        "ownership": {"default": 0},
        "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!actors!{actor_id}",
    }

    # File into a folder by creature type.
    tval = actor["system"]["details"]["type"]["value"]
    fname, fcolor = TYPE_FOLDER.get(tval, ("Other", "#555555"))
    actor["folder"] = folders.fid("Actor", fname)
    USED_MONSTER_FOLDERS[fname] = fcolor

    # Bake in spellcasting: ability, slots, DC bonus, and embedded spell items.
    matched, unmatched = spell_embed.embed_spellcasting(
        actor, mon, actor_id, pb, ability_mod)
    if matched or unmatched:
        SPELL_REPORT.append((actor_id, mon["name"], matched, unmatched))

    return actor


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "monster"


def main():
    inter = os.path.join(REPO, "intermediate")
    monsters = json.load(open(os.path.join(inter, "monsters.json"),
                              encoding="utf-8"))
    main_names = {m["name"].lower() for m in monsters}

    # Append net-new WIP monsters (skip any that duplicate the finished bestiary).
    wip_path = os.path.join(inter, "monsters_wip.json")
    wip_added = 0
    if os.path.exists(wip_path):
        for m in json.load(open(wip_path, encoding="utf-8")):
            if m["name"].lower() in main_names:
                continue
            m["_wip"] = True
            monsters.append(m)
            main_names.add(m["name"].lower())
            wip_added += 1

    out_dir = os.path.join(REPO, "src", "monsters")
    os.makedirs(out_dir, exist_ok=True)
    # clean old
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(out_dir, fn))

    seen = {}
    count = 0
    for mon in monsters:
        actor = build_actor(mon)
        slug = slugify(mon["name"])
        if slug in seen:
            seen[slug] += 1
            slug = f"{slug}-{seen[slug]}"
        else:
            seen[slug] = 0
        with open(os.path.join(out_dir, slug + ".json"), "w", encoding="utf-8") as f:
            json.dump(actor, f, indent=2, ensure_ascii=False)
        count += 1

    # folder documents (by creature type)
    for fname, fcolor in USED_MONSTER_FOLDERS.items():
        doc = folders.folder_doc("Actor", fname, fcolor)
        with open(os.path.join(out_dir, "_folder-" + slugify(fname) + ".json"),
                  "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2, ensure_ascii=False)

    print(f"Wrote {count} actor files to {out_dir} "
          f"({count - wip_added} main + {wip_added} WIP) "
          f"in {len(USED_MONSTER_FOLDERS)} folders")

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

    if spell_embed.DROPPED:
        print(f"  {len(spell_embed.DROPPED)} mis-split statblock fragment(s) dropped "
              "(a pact-magic header HEADER cannot parse; the spells inside them are "
              "not embedded and not in the manifest):")
        for frag in sorted(set(spell_embed.DROPPED)):
            print(f"      {frag}")

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


if __name__ == "__main__":
    main()
