#!/usr/bin/env python3
"""Build ALL WC5E custom spells as dnd5e 5.3.3 spell items in src/spells/.

Header fields + descriptions come from extract_spells.py (WIP Ch.6, the most
complete list). Activity mechanics are AUTO-DETECTED from each description
(attack / save / heal / utility, damage dice+type, save ability, AoE template,
slot scaling) using the same phrasing patterns proven on monster statblocks,
with a small OVERRIDES table for cases the detector can't get exactly right.
Schema verified against dnd5e 5.3.3 SRD spells.
"""
import json
import os
import re
import hashlib

import folders

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

USED_SPELL_FOLDERS = set()

def _level_folder(level):
    if level == 0:
        return "Cantrips"
    suf = {1: "st", 2: "nd", 3: "rd"}.get(level, "th")
    return f"{level}{suf}-Level"

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

SRC = {"custom": "Warcraft 5e - Chapter 6 Spells",
       "book": "Warcraft 5e - Chapter 6 Spells", "page": "",
       "license": "", "rules": "2014"}
IMG = "icons/svg/daze.svg"

DAMAGE_TYPES = {"acid", "bludgeoning", "cold", "fire", "force", "lightning",
                "necrotic", "piercing", "poison", "psychic", "radiant",
                "slashing", "thunder"}
# WC5E flavour damage words -> 5e types
DTYPE_ALIAS = {"frost": "cold", "shadow": "necrotic", "arcane": "force",
               "holy": "radiant", "nature": "poison"}
ABBR = {"strength": "str", "dexterity": "dex", "constitution": "con",
        "intelligence": "int", "wisdom": "wis", "charisma": "cha"}


def dpart(n, d, types, scale=None, bonus="", mode="whole"):
    """One damage (or healing) part.

    `types` may be a list, and when it holds more than one the damage roll dialog
    renders a dropdown to pick which applies -- that is how a "choose acid, cold,
    fire, lightning or thunder" spell stays one button instead of five.

    `mode` is the scaling mode: "whole" adds `scale` dice per slot level, "half"
    adds them every *other* level, which is what "for every two slot levels above"
    means and what auto_detect deliberately refuses to guess.
    """
    tl = [] if not types else ([types] if isinstance(types, str) else list(types))
    return {"number": n, "denomination": d, "bonus": bonus, "types": tl,
            "custom": {"enabled": False, "formula": ""},
            "scaling": {"mode": mode if scale else "", "number": scale,
                        "formula": ""}}


# ---------------------------------------------------------------------------
# Auto-detect mechanics from a spell description
# ---------------------------------------------------------------------------
def _strip(html):
    return re.sub(r"<[^>]+>", " ", html)

def _dtype(word):
    w = word.lower()
    if w in DAMAGE_TYPES:
        return w
    return DTYPE_ALIAS.get(w, None)

DMG_RE = re.compile(r"(\d+)d(\d+)(?:\s*\+\s*\d+)?\s+(\w+)\s+damage", re.I)
SAVE_RE = re.compile(r"(strength|dexterity|constitution|intelligence|wisdom|charisma)"
                     r"\s+saving throw", re.I)
ATK_RE = re.compile(r"make a (ranged|melee) spell attack", re.I)


def auto_detect(desc_html):
    t = _strip(desc_html)
    tl = t.lower()

    # base damage is stated before any scaling clause; truncate there so the
    # "increases by NdM ... damage" sentence isn't read as a base damage part.
    cut = len(t)
    for marker in ("at higher levels", "increases by", "this spell's damage",
                   "this spell’s damage"):
        i = tl.find(marker)
        if i != -1:
            cut = min(cut, i)
    dmg_text = t[:cut]

    # Base damage is in the FIRST sentence that mentions damage. Later sentences
    # describe conditional / ongoing / "instead" damage, which we don't bake in.
    # (Simultaneous dual damage — "2d6 fire and 2d6 cold damage" — is one
    # sentence, so it's still captured.)
    dmg_sentence = ""
    for sent in re.split(r"(?<=[.;])\s+", dmg_text):
        if "damage" in sent.lower() and DMG_RE.search(sent):
            dmg_sentence = sent
            break

    dmg, seen = [], set()
    for m in DMG_RE.finditer(dmg_sentence):
        typ = _dtype(m.group(3))
        key = (m.group(1), m.group(2), typ)
        if key in seen:
            continue
        seen.add(key)
        dmg.append([int(m.group(1)), int(m.group(2)), typ, None])

    # slot / cantrip scaling
    scale = None
    mc = re.search(r"increases by (\d+)d(\d+) when you reach 5th", t, re.I)
    ml = re.search(r"increases by (\d+)d(\d+).{0,40}for each slot level above", t, re.I)
    if "for every two slot" not in tl:   # non-standard scaling -> leave off
        if mc:
            scale = int(mc.group(1))
        elif ml:
            scale = int(ml.group(1))
    if scale:
        for p in dmg:
            p[3] = scale

    # AoE template.
    #
    # Cylinders are written radius-first -- "a 20-foot-radius, 40-foot-high
    # cylinder" -- so a plain radius pattern wins the race and the height is lost.
    # Look for the cylinder wording first and pull both numbers out of it.
    tpl = None
    cyl = re.search(r"(\d+)[- ]foot[- ]radius,?\s*(\d+)[- ]foot[- ](?:tall|high)"
                    r"|(\d+)[- ]foot[- ](?:tall|high)[^.]{0,30}?(\d+)[- ]foot radius", tl)
    if cyl:
        radius, height = ((cyl.group(1), cyl.group(2)) if cyl.group(1)
                          else (cyl.group(4), cyl.group(3)))
        tpl = ("cylinder", radius, None, height)
    else:
        for pat, kind in [(r"(\d+)[- ]foot[- ]radius", "sphere"),
                          (r"(\d+)[- ]foot[- ](?:tall |high )?cylinder", "cylinder"),
                          (r"(\d+)[- ]foot[- ]cone", "cone"),
                          (r"(\d+)[- ]foot .{0,8}line", "line")]:
            mm = re.search(pat, tl)
            if mm:
                # dnd5e distinguishes a sphere centred on a point from an emanation
                # centred on the caster, and the difference is visible at the table:
                # an emanation is placed on your own token instead of being aimed.
                if kind == "sphere" and re.search(
                        r"radius[^.]{0,40}\b(?:of|around|from|centered on)\s+you\b", tl):
                    kind = "radius"
                tpl = (kind, mm.group(1), "5" if kind == "line" else None, None)
                break

    atk = ATK_RE.search(tl)
    sv = SAVE_RE.search(tl)
    # `tpl` rides on every kind, not just saves. An attack spell can still carry an
    # area (Starsurge's line), and so can a heal (Healing Rain's radius); returning
    # it only from the save branch is why most of the area-tagged spells shipped
    # with no template to place.
    if atk and dmg:
        return {"kind": "attack", "atk": atk.group(1), "dmg": dmg, "tpl": tpl}
    if sv:
        onsave = "half" if re.search(r"half as much|half the|half damage", tl) else "none"
        return {"kind": "save", "save": ABBR[sv.group(1).lower()], "dmg": dmg,
                "onsave": onsave if dmg else "none", "tpl": tpl}
    if re.search(r"regains?\b.{0,40}hit points", tl) and not dmg:
        hm = re.search(r"(\d+)d(\d+)", t)
        if hm:
            return {"kind": "heal", "tpl": tpl,
                    "heal": (int(hm.group(1)), int(hm.group(2)), "@mod", scale)}
    return {"kind": "utility", "tpl": tpl}


# Overrides where the detector can't be exact (flat damage, weird scaling, etc.)
#
# Glacial Spike reads "Dexterity saving throw ... 8d8 + 40 cold damage" with no
# scaling clause at all. The first version of this entry disagreed with the text
# on every axis -- con instead of dex, 7d8 with invented per-2-level scaling, and
# a flat 30 of *bludgeoning* -- which is exactly the failure mode an override
# table invites, since nothing cross-checks it against the description. Keep
# these honest against the source text.
OVERRIDES = {
    "glacial spike": {"kind": "save", "save": "dex", "onsave": "half",
                      "dmg": [(8, 8, "cold", None)], "flat": [("40", "cold")]},

    # -- areas the wording hides ------------------------------------------------
    # The detector keys off "N-foot radius/cone/line". These spells measure the
    # same shapes in prose the pattern cannot see: "30 feet long and 5 feet wide",
    # "within 15 feet of you".
    "divine star": {"tpl": ("line", "30", "5", None)},
    "starsurge": {"tpl": ("line", "100", "5", None)},
    # Named because a second, differently-named activity sits beside it: an unnamed
    # button reads as "the spell" rather than as one of its two halves.
    "halo": {"tpl": ("radius", "60", None, None), "name": "Light — Damage"},
    "apotheosis": {"name": "Aura (creature enters or ends its turn within 10 ft)"},
    # Three breath weapons on one document. Splitting them into three spells was
    # worse: a known-caster picks a fixed number of spells, so three entries meant
    # choosing one breath weapon forever instead of the choice the spell grants.
    "deathwyrm's fury": {"name": "Emberwyrm — fire (60 ft cone)",
                         "tpl": ("cone", "60", None, None),
                         "dmg": [(5, 8, "fire", None), (5, 8, "necrotic", None)]},
    "luminous barrier": {"tpl": ("radius", "30", None, None)},
    # Emanations whose "you" reads before the distance rather than after it, so the
    # sphere-vs-emanation test in auto_detect cannot see it.
    "mantle of the fallen crusader": {"tpl": ("radius", "30", None, None)},
    "salvation": {"tpl": ("radius", "60", None, None)},
    "shadowy apparitions": {"dmg": [(8, 6, "psychic", 1)]},

    # -- scaling the detector skipped or invented -------------------------------
    # "for every two slot levels" is Half mode, which auto_detect deliberately
    # refuses to guess; and Living Bomb scales only its explosion, not the initial
    # tick, so the whole-level scaling it picked up is wrong in the other direction.
    "living bomb": {"dmg": [(1, 10, "fire", None)]},
    "rain of fire": {"dmg": [(3, 6, "bludgeoning", None), (3, 6, "fire", 2)]},
    "starfire": {"dmg": [(3, 6, "radiant", 1)]},
    "blood boil": {"tpl": ("radius", "15", None, None),
                   "dmg": [(2, 4, "fire", 1), (2, 4, "necrotic", 1)]},
    "lava burst": {"dmg": [(3, 6, "fire", 1), (3, 6, "bludgeoning", 1)]},
    "devouring plague": {"dmg": [(2, 8, "necrotic", 1)]},
    "exorcism": {"dmg": [(3, 8, "radiant", 1)]},
    # "+1d6 for every two slot levels above 5th" is Half mode, and the detector's
    # generic "regains NdM hit points" reading tacked on a spellcasting modifier
    # this spell never mentions.
    "healing rain": {"heal": (2, 6, "", 1), "healmode": "half"},

    # -- spells that rolled nothing at all --------------------------------------
    # Each of these describes a save, an attack or a heal in its text, but came out
    # of auto_detect as a bare utility -- casting them produced a chat card with no
    # button on it. Lunar Strike was the worst case: a damage cantrip that rolled
    # no damage.
    "lunar strike": {"kind": "save", "save": "dex", "onsave": "none",
                     "dmg": [(1, 6, "force", 1)]},
    "light of the protector": {"kind": "heal", "heal": (5, 12, "30", None)},
    "freezing touch": {"kind": "attack", "atk": "melee", "dmg": []},
    # One damage part carrying every option, so the roll dialog offers a dropdown
    # to pick the type rather than the spell needing one button per element.
    "elemental shock": {"kind": "save", "save": "dex", "onsave": "half",
                        "dmg": [(3, 8, ["acid", "cold", "fire", "lightning",
                                        "thunder"], 1)]},
    "touch of chaos": {"dmg": [(1, 8, ["acid", "cold", "fire", "force", "lightning",
                                       "poison", "psychic", "thunder"], 1)]},
    # "increases by 1d4 per shard when you reach 5th level" -- the words between the
    # dice and "when you reach" are enough to lose the cantrip-scaling pattern, so
    # the first shard scaled while the other two did not.
    "flurry": {"dmg": [(1, 4, "cold", 1)]},

    # -- print the modifier rather than automating it ---------------------------
    # [[lookup @attributes.spell.mod]] resolves against the caster's roll data, so
    # the card shows the actual number instead of the words. These buff someone else
    # until a condition nothing can detect -- the next ability check, the next
    # Wisdom save that would have failed -- and an Active Effect for that would sit
    # on the sheet through an hour of game time that never passes out of combat.
    # Flavour on the primary activity, not a second button: the spell has one thing
    # to say and one button to say it on.
    "inner focus": {
        "flavor": "The next ability check the target makes adds "
                  "<strong>+[[lookup @attributes.spell.mod]]</strong>, then the "
                  "spell ends."},
    "inner will": {
        "flavor": "Wisdom saving throws add "
                  "<strong>+[[lookup @attributes.spell.mod]]</strong> until the "
                  "target passes one it would otherwise have failed."},
    "beacon of light": {
        "flavor": "Whenever you restore hit points with a spell slot, the marked "
                  "creature regains <strong>[[lookup @attributes.spell.mod]]</strong> "
                  "hit points."},
    "bloodlust and heroism": {
        "flavor": "Each target gains "
                  "<strong>[[lookup @attributes.spell.mod]]</strong> temporary hit "
                  "points at the start of its turn."},
    # The detector read the weapon rider's 2d8 as the spell's own save damage, so
    # the primary button rolled a Constitution save nothing in the text asks for.
    # The rider is a damage button and the torrent is the save; the cast itself
    # rolls nothing.
    "unholy weapon": {"kind": "utility"},
}


# Statblocks that upstream lays out inside a spell's column. extract_spells.py
# takes everything up to the next "####", so a sidebar creature lands in whichever
# spell it happens to follow -- the Shambling Horde belongs to Army of the Dead but
# sits between Archangel and it in the markdown, so Archangel absorbed the whole
# thing, and with it a spurious "DC 15 Constitution saving throw" that auto_detect
# turned into a save activity on a self-buff. We ship these creatures as real
# actors in the summons pack, so the transcribed block is redundant as well as
# misplaced. Match a paragraph that opens a blockquote heading and cut to the end.
# Spells whose only "N-foot radius" is a light or darkness radius, not an area
# anything is measured against. Placing a template for those puts a circle on the
# map that no creature is ever checked against, which reads as a bug.
# Apotheosis and Unholy Weapon do have real areas -- a 30-foot line and a 30-foot
# torrent -- but they belong to specific activities, wired per spell rather than
# guessed from the first distance in the text.
NO_TEMPLATE = {"Apotheosis", "Diabolism", "Solar Wrath"}


def _summon_uuids():
    """name -> compendium UUID for every actor in the hand-maintained summons pack.

    Read from src/summons rather than hardcoded, so a summon activity cannot end up
    pointing at an id that no longer exists -- a broken summon profile is silent in
    Foundry, the button simply summons nothing. Missing names fail the build here
    instead, which is the whole point of looking them up.
    """
    out = {}
    for fn in sorted(os.listdir(os.path.join(REPO, "src", "summons"))):
        if not fn.endswith(".json") or fn.startswith("_folder"):
            continue
        with open(os.path.join(REPO, "src", "summons", fn), encoding="utf-8") as f:
            doc = json.load(f)
        if doc.get("type") == "npc":
            out[doc["name"]] = f"Compendium.wc5e-foundryvtt.summons.Actor.{doc['_id']}"
    return out


SUMMON = _summon_uuids()

STATBLOCK_RE = re.compile(r"<p>>\s*##\s.*$", re.S)
STRIPPED_STATBLOCKS = []


def strip_statblock(name, desc):
    out = STATBLOCK_RE.sub("", desc)
    if out != desc:
        STRIPPED_STATBLOCKS.append(name)
    return out

# Active Effects for duration buffs, so the bonus applies to rolls automatically
# instead of the player remembering it.
#
# `system.bonuses.{mwak,rwak,msak,rsak}.{attack,damage}` are real actor fields, and
# dnd5e's FormulaField overrides _applyChangeAdd to join with an operator ("1d4"
# then "1d6" gives "1d4 + 1d6"), so ADD mode stacks correctly rather than
# concatenating into nonsense.
#
# Only *duration* buffs belong here. A "next time you hit" spell like Righteous
# Smite would keep applying to every attack until someone manually deleted the
# effect, which is worse than not automating it -- dnd5e has no once-per-hit
# expiry. Unholy Weapon buffs one specific weapon, which needs the enchantment
# system rather than an actor-wide bonus.
#
# Every effect here must be findable and removable by hand. The character sheet's
# Effects tab groups them and shows a Source column naming the spell, so anything
# we put on the actor shows up there -- but Foundry's clock only advances in the
# combat tracker, so a duration is useless out of combat and the Effects tab is the
# real removal path. 14 of these spells are concentration, which dnd5e drops by
# itself; the rest sit until deleted, which is why the set is kept small.
EFFECTS = {
    "Dread Favor": {
        "seconds": 60,
        "changes": [("system.bonuses.mwak.damage", "1d4"),
                    ("system.bonuses.rwak.damage", "1d4")],
        "hint": "Weapon attacks deal +1d4 necrotic while this is active.",
    },
    # AC overrides. "While unarmored" cannot be a condition on an effect, so the
    # hint carries it -- the alternative is not automating AC at all, and these two
    # spells exist to change AC.
    "Demon Skin": {
        "seconds": 28800,
        "changes": [("system.attributes.ac.calc", "custom", 5),
                    ("system.attributes.ac.formula", "11 + @attributes.spell.mod", 5),
                    ("system.attributes.hp.tempmax", "3")],
        "hint": "While unarmored, AC becomes 11 + your spellcasting modifier. "
                "Maximum hit points rise by 3 (+3 per slot above 1st) and drop back "
                "when this ends. Remove this effect from the Effects tab when the "
                "spell ends.",
    },
    "Inner Fire": {
        "seconds": 28800,
        "changes": [("system.attributes.ac.calc", "custom", 5),
                    ("system.attributes.ac.formula", "11 + @attributes.spell.mod", 5)],
        "hint": "While unarmored, AC becomes 11 + your spellcasting modifier. You "
                "also have advantage on saves to avoid or end being frightened, "
                "which is not automated.",
    },
    "Lightning Shield": {
        "seconds": 600,
        "changes": [("system.attributes.ac.bonus", "1")],
        "hint": "+1 AC. Use the Retaliate activity when a creature hits you in melee.",
    },
    "Reincarnation": {
        "seconds": 864000,
        "changes": [("system.bonuses.mwak.attack", "-4"),
                    ("system.bonuses.rwak.attack", "-4"),
                    ("system.bonuses.msak.attack", "-4"),
                    ("system.bonuses.rsak.attack", "-4"),
                    ("system.bonuses.abilities.save", "-4"),
                    ("system.bonuses.abilities.check", "-4")],
        "hint": "The -4 penalty for coming back from the dead. It reduces by 1 after "
                "each long rest -- edit the values here, and delete the effect when "
                "it reaches 0.",
    },
    "Bloodlust and Heroism": {
        "seconds": 60,
        "changes": [("system.bonuses.mwak.attack", "1d4"),
                    ("system.bonuses.rwak.attack", "1d4"),
                    ("system.bonuses.msak.attack", "1d4"),
                    ("system.bonuses.rsak.attack", "1d4"),
                    ("system.bonuses.abilities.save", "1d4"),
                    ("system.traits.ci.value", "frightened")],
        "hint": "Immune to frightened, and +1d4 on attack rolls and saving throws. "
                "Temporary hit points equal to your spellcasting modifier at the "
                "start of each turn are tracked by the player.",
    },
}


def build_effects(item_id, name):
    spec = EFFECTS.get(name)
    if not spec:
        return []
    eid = make_id("effect", name)
    return [{
        "_id": eid,
        "name": name,
        "img": IMG,
        "type": "base",
        # A 3-tuple names its own mode: 2 is ADD (dnd5e's FormulaField joins with an
        # operator, so "1d4" then "1d6" stacks as "1d4 + 1d6"), 5 is OVERRIDE, which
        # is what an AC formula needs -- adding to a calculation is meaningless.
        "changes": [{"key": c[0], "mode": c[2] if len(c) > 2 else 2,
                     "value": c[1], "priority": 20}
                    for c in spec["changes"]],
        "disabled": False,
        "duration": {"startTime": None, "seconds": spec["seconds"], "combat": None,
                     "rounds": None, "turns": None, "startRound": None,
                     "startTurn": None},
        "description": f"<p>{spec['hint']}</p>",
        "origin": None,
        "tint": "#ffffff",
        "transfer": False,       # applied when the spell is cast, not while merely known
        "statuses": spec.get("statuses", []),
        "sort": 0,
        "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!items.effects!{item_id}.{eid}",
    }]


# ---------------------------------------------------------------------------
# Activity + item assembly
# ---------------------------------------------------------------------------
def base_act(aid, kind, activation):
    return {
        "_id": aid, "type": kind, "sort": 0, "name": "", "img": "",
        "activation": {"type": activation["type"], "value": activation["value"],
                       "condition": activation.get("condition", ""), "override": False},
        "consumption": {"targets": [], "scaling": {"allowed": False, "max": ""}, "spellSlot": True},
        "description": {"chatFlavor": ""},
        "duration": {"units": "inst", "concentration": False, "override": False},
        "effects": [], "range": {"override": False},
        "target": {"template": {"contiguous": False, "units": "ft"},
                   "affects": {"choice": False}, "prompt": True, "override": False},
        "uses": {"spent": 0, "recovery": [], "max": ""},
    }


def tpl_target(tpl):
    ttype, size, width, height = tpl
    return {"affects": {"type": "", "count": "", "choice": False, "special": ""},
            "template": {"count": "", "contiguous": False, "type": ttype, "size": size,
                         "width": width or "", "height": height or "", "units": "ft"}}


def make_activity(aid, mech, activation):
    """Build one activity of any kind from a mech spec.

    The primary activity and every extra one go through here, so an "extra" is
    just another mech dict -- there is no second, thinner code path that quietly
    supports fewer fields than the first. `name`, `flavor`, `sort` and a
    per-activity `tpl` are the only things extras add.
    """
    kind = mech["kind"]
    parts = [dpart(*p) for p in mech.get("dmg", [])]
    for bonus, t in mech.get("flat", []):
        parts.append(dpart(None, None, t, None, bonus=bonus))

    if kind == "attack":
        a = base_act(aid, "attack", activation)
        a["attack"] = {"ability": "", "bonus": "", "critical": {"threshold": None},
                       "flat": False,
                       "type": {"value": mech.get("atk", "ranged"), "classification": ""}}
        a["damage"] = {"critical": {"bonus": ""}, "includeBase": True, "parts": parts}
    elif kind == "save":
        a = base_act(aid, "save", activation)
        a["save"] = {"ability": [mech["save"]],
                     "dc": {"calculation": "spellcasting", "formula": ""}}
        a["damage"] = {"onSave": mech.get("onsave", "half" if parts else "none"),
                       "parts": parts}
    elif kind == "damage":
        # No attack roll and no save -- a damage button the player clicks when the
        # condition in the text applies (Exorcism against a fiend, Starfire under
        # a clear moon). Rolling it through an activity keeps resistance and
        # immunity honest, which a hand-rolled die does not.
        a = base_act(aid, "damage", activation)
        a["damage"] = {"critical": {"bonus": ""}, "parts": parts}
    elif kind == "heal":
        a = base_act(aid, "heal", activation)
        n, d, bonus, scale = mech["heal"][:4]
        htype = mech["heal"][4] if len(mech["heal"]) > 4 else "healing"
        a["healing"] = dpart(n, d, htype, scale, bonus=bonus,
                             mode=mech.get("healmode", "whole"))
    elif kind == "summon":
        a = base_act(aid, "summon", activation)
        a["bonuses"] = {"ac": "", "hp": "", "hd": "", "attackDamage": "",
                        "saveDamage": "", "healing": ""}
        a["creatureSizes"] = []
        a["creatureTypes"] = mech.get("creatureTypes", [])
        # Match the caster on attacks, saves and proficiency: a summon whose to-hit
        # is frozen at the statblock's value gets worse every level, and every one
        # of these creatures is scaled off the caster in its text.
        a["match"] = {"attacks": mech.get("match", True), "proficiency": mech.get("match", True),
                      "saves": mech.get("match", True), "ability": "", "disposition": True}
        a["profiles"] = [
            {"_id": make_id(aid, "profile", str(i)), "count": p.get("count", ""),
             "cr": p.get("cr", ""), "level": {"min": None, "max": None},
             "name": p.get("name", ""), "types": p.get("types", []),
             "uuid": p.get("uuid", "")}
            for i, p in enumerate(mech["profiles"])]
        # "cr" mode lets the player pick any actor up to a challenge rating from
        # their own compendiums, which is what an open-ended conjure asks for;
        # "" is the direct mode, summoning the profile's own actor.
        a["summon"] = {"mode": mech.get("mode", ""), "prompt": True}
        a["tempHP"] = ""
    elif kind == "check":
        a = base_act(aid, "check", activation)
        # An empty dc.calculation means the DC comes from dc.formula, and an empty
        # formula means no DC at all -- the button still rolls the check, which is
        # the useful half when the DC depends on something the sheet cannot see.
        a["check"] = {"ability": mech.get("ability", "spellcasting"),
                      "associated": [],
                      "dc": {"calculation": mech.get("dccalc", ""),
                             "formula": mech.get("dc", "")}}
    else:
        a = base_act(aid, "utility", activation)
        a["roll"] = {"formula": "", "name": "", "prompt": False, "visible": False}

    if mech.get("name"):
        a["name"] = mech["name"]
    if mech.get("flavor"):
        a["description"] = {"chatFlavor": mech["flavor"]}
    if mech.get("sort"):
        a["sort"] = mech["sort"]
    if mech.get("tpl"):
        # override=True, or the activity silently inherits the item's area instead
        # of the one it was given.
        a["target"] = {**tpl_target(mech["tpl"]), "prompt": True, "override": True}
    return {aid: a}


def build_activity(spell_id, mech, activation, name=None):
    # The primary activity inherits the item's area, so it must not carry its own
    # copy -- two templates describing the same circle drift the moment one is
    # corrected. Only extras, which differ from the item, override.
    acts = make_activity(make_id(spell_id, "act"), {**mech, "tpl": None}, activation)
    # An effect sitting on the item is inert unless an activity names it: dnd5e
    # renders the "apply effect" button from activity.effects, not from the item's
    # effect list. Dread Favor shipped with its Active Effect unreachable for
    # exactly this reason -- the bonus existed and nothing could ever apply it.
    if name in EFFECTS:
        for a in acts.values():
            a["effects"] = [{"_id": make_id("effect", name)}]
    return acts


# Optional alternative modes that auto_detect can't express: a second activity the
# player can click instead of the default one. The self-inflicted cost is stated in
# the activity's chat flavour rather than wired as consumption -- dnd5e's
# consumption types don't verifiably cover paying hit points, and a malformed
# consumption block is worse than a line of text the player acts on.
ALT_ACTIVITIES = {
    # Shadow Bolt's alternative mode. Keyed "alt" so its id predates the general
    # table below and stays stable for worlds that already reference it.
    "Shadow Bolt": {
        "kind": "attack", "sort": 100,
        "name": "Empowered (take 1 psychic damage)",
        "dmg": [(1, 12, "necrotic", 1)],
        "flavor": "You take 1 point of psychic damage (3 at 5th level, 5 at 11th) "
                  "to increase the damage die to d12.",
    },
}


def build_alt_activity(spell_id, name, activation):
    spec = ALT_ACTIVITIES.get(name)
    if not spec:
        return {}
    return make_activity(make_id(spell_id, "act", "alt"), spec, activation)


# Additional clickable activities. dnd5e renders one button per activity and shows
# them all at once, so this is how a spell offers a conditional damage roll, a
# healing half, or a second mode -- there is no "which version are you casting?"
# prompt to hang them off instead.
#
# Ids derive from the spell name plus the key, so adding an entry never disturbs
# the ids of the ones already there.
EXTRA_ACTIVITIES = {
    # -- healing that shares a cast with damage --------------------------------
    "Divine Star": {
        "heal": {"kind": "heal", "name": "Healing (allies in the line)", "sort": 10,
                 "heal": (2, 8, "", 1), "tpl": ("line", "30", "5", None)},
    },
    "Holy Nova": {
        "heal": {"kind": "heal", "name": "Healing (allies)", "sort": 10,
                 "heal": (3, 6, "", 1), "tpl": ("radius", "15", None, None)},
    },
    "Holy Prism": {
        "heal": {"kind": "heal", "name": "Heal (1d4 + spellcasting modifier)", "sort": 10,
                 "heal": (1, 4, "@attributes.spell.mod", 1)},
    },
    "Halo": {
        "lightheal": {"kind": "heal", "name": "Light — Healing (allies)", "sort": 10,
                      "heal": (6, 6, "", None), "tpl": ("radius", "60", None, None)},
        "shadow": {"kind": "save", "name": "Shadow — Damage", "sort": 20, "save": "con",
                   "onsave": "half", "tpl": ("radius", "60", None, None),
                   "dmg": [(6, 6, "necrotic", None), (6, 6, "psychic", None)],
                   "flavor": "A creature 50 feet or more away makes the save with "
                             "disadvantage."},
    },

    # -- conditional extra damage ----------------------------------------------
    "Exorcism": {
        "vs": {"kind": "damage", "sort": 10,
               "name": "Vs. Aberration, Fiend or Undead (+2d8)",
               "dmg": [(2, 8, "radiant", None)]},
    },
    "Starfire": {
        "moon": {"kind": "damage", "sort": 10, "name": "Clear view of the moon (+1d6)",
                 "dmg": [(1, 6, "radiant", None)]},
    },
    "Starfall": {
        "moon": {"kind": "damage", "sort": 10, "name": "Clear view of the moon (+2d6)",
                 "dmg": [(2, 6, "radiant", None)]},
    },
    "Starsurge": {
        "moon": {"kind": "damage", "sort": 10, "name": "Clear view of the moon (+2d6)",
                 "dmg": [(2, 6, "radiant", None)]},
    },
    "Lightning Blast": {
        "metal": {"kind": "attack", "sort": 10, "name": "Vs. metal armor (1d12)",
                  "dmg": [(1, 12, "lightning", 1)]},
    },
    "Shadow Bolt": {
        "self": {"kind": "damage", "sort": 110, "name": "Self-damage (psychic)",
                 "flat": [("1", "psychic")],
                 "flavor": "Target yourself. 1 point at 1st level, 3 at 5th, 5 at "
                           "11th, 7 at 17th."},
    },

    # -- second halves the text describes but nothing rolled --------------------
    "Cataclysm": {
        "aflame": {"kind": "damage", "sort": 10, "name": "Aflame (start of turn)",
                   "dmg": [(2, 6, "fire", None)]},
        "douse": {"kind": "damage", "sort": 20, "name": "Putting out the flames",
                  "dmg": [(1, 6, "fire", None)]},
        "ground": {"kind": "damage", "sort": 30, "name": "Entering the scorched ground",
                   "dmg": [(1, 6, "fire", None)]},
    },
    "Living Bomb": {
        "boom": {"kind": "save", "sort": 10, "name": "Explosion (when the spell ends)",
                 "save": "dex", "onsave": "half", "dmg": [(2, 6, "fire", 1)],
                 "tpl": ("sphere", "10", None, None)},
    },
    "Drain Life": {
        # "for every two slot levels" is Half mode -- the reason auto_detect skips
        # this spell's scaling entirely rather than guessing Whole.
        "bonus": {"kind": "damage", "sort": 10, "name": "Bonus action drain (1d8)",
                  "dmg": [(1, 8, "necrotic", 1, "", "half")],
                  "flavor": "You regain hit points equal to half the damage dealt, and "
                            "the target's hit point maximum drops by the same amount."},
    },
    "Lightning Shield": {
        "retaliate": {"kind": "damage", "sort": 10,
                      "name": "Retaliate (creature hits you in melee)",
                      "dmg": [(1, 4, "lightning", 1)]},
    },
    "Unholy Weapon": {
        # This wants dnd5e's enchantment system -- it buffs one weapon, and an
        # actor-wide system.bonuses.mwak.damage would buff every weapon the caster
        # owns. Enchantment changes live under effect.system.changes with string
        # types ("add"/"upgrade"/"override"), a shape none of the SRD spells use for
        # damage, so getting it right needs testing in Foundry rather than guessing.
        # A damage button is honest in the meantime: it rolls, and resistance
        # resolves.
        "rider": {"kind": "damage", "sort": 5, "name": "Weapon hit (+2d8 necrotic)",
                  "dmg": [(2, 8, "necrotic", None)]},
        "torrent": {"kind": "save", "sort": 10, "name": "Dismiss — Torrent of Shadows",
                    "save": "con", "onsave": "half", "dmg": [(4, 8, "necrotic", None)],
                    "tpl": ("sphere", "30", None, None),
                    "flavor": "Bonus action. A creature that fails is also blinded for "
                              "1 minute, repeating the save at the end of each turn."},
    },
    "Apotheosis": {
        "line": {"kind": "save", "sort": 10, "name": "Holy radiance (30 ft line)",
                 "save": "con", "onsave": "half", "dmg": [(8, 8, "radiant", None)],
                 "tpl": ("line", "30", "10", None)},
        "touch": {"kind": "heal", "sort": 20, "name": "Healing light (touch)",
                  "heal": (8, 8, "", None)},
    },

    # -- checks the text describes in prose -------------------------------------
    "Mass Dispel": {
        "check": {"kind": "check", "sort": 10, "name": "Dispel check (4th level or higher)",
                  "ability": "spellcasting",
                  "flavor": "DC is 10 + the level of the spell you are trying to end. "
                            "That is the <em>target's</em> level, which the sheet cannot "
                            "know, so the button rolls the check and the DM compares."},
    },
    "Spellsteal": {
        "check": {"kind": "check", "sort": 10, "name": "Steal check (2nd level or higher)",
                  "ability": "spellcasting",
                  "flavor": "DC is 10 + the level of the spell you are trying to steal. "
                            "That is the <em>target's</em> level, which the sheet cannot "
                            "know, so the button rolls the check and the DM compares."},
    },
    "Cyclone": {
        "escape": {"kind": "check", "sort": 10, "name": "Escape (Strength vs your DC)",
                   "ability": "str", "dccalc": "spellcasting"},
    },
    "Lunar Strike": {
        # "instead deals 1d8" -- an alternative, not an addition, so it is a full
        # save activity rather than a bolt-on damage button.
        "moon": {"kind": "save", "sort": 10, "name": "Clear view of the moon (1d8 instead)",
                 "save": "dex", "onsave": "none", "dmg": [(1, 8, "force", 1)]},
    },
    "Flurry": {
        # Three separate attack rolls that may be aimed at different targets, which
        # one activity cannot express.
        "shard2": {"kind": "attack", "sort": 10, "name": "Second shard",
                   "dmg": [(1, 4, "cold", 1)]},
        "shard3": {"kind": "attack", "sort": 20, "name": "Third shard",
                   "dmg": [(1, 4, "cold", 1)]},
    },
    # -- summons ----------------------------------------------------------------
    # Every creature here already ships in the summons pack, so these are wiring,
    # not new content. A profile list with more than one entry gives the player a
    # picker before the summon lands -- the one genuine "choose a variant" prompt
    # dnd5e has.
    "Army of the Dead": {
        "summon": {"kind": "summon", "sort": 10, "name": "Summon the horde",
                   "match": False,   # you explicitly do not control it
                   "profiles": [{"name": "Shambling Horde", "count": "1",
                                 "uuid": SUMMON["Shambling Horde"]}],
                   "flavor": "Roll initiative for the horde. It acts on its own and "
                             "attacks the nearest non-undead."},
    },
    "Feral Spirits": {
        "summon": {"kind": "summon", "sort": 10, "name": "Summon two ghostly wolves",
                   "profiles": [{"name": "Feral Spirit", "count": "2",
                                 "uuid": SUMMON["Feral Spirit"]}]},
    },
    "Shadowy Apparitions": {
        "summon": {"kind": "summon", "sort": 10, "name": "Create three apparitions",
                   "profiles": [{"name": "Shadowy Apparition", "count": "3",
                                 "uuid": SUMMON["Shadowy Apparition"]}]},
    },
    "Summon Void Being": {
        "summon": {"kind": "summon", "sort": 10, "name": "Summon the void being",
                   "profiles": [
                       {"name": "Mindbender", "count": "1",
                        "uuid": SUMMON["Void Being (Mindbender)"]},
                       {"name": "Psyfiend", "count": "1",
                        "uuid": SUMMON["Void Being (Psyfiend)"]},
                       {"name": "Shadowfiend", "count": "1",
                        "uuid": SUMMON["Void Being (Shadowfiend)"]}]},
    },
    # -- print the modifier rather than automating it ---------------------------
    # [[lookup @attributes.spell.mod]] resolves against the caster's roll data, so
    # the card shows the actual number. These spells buff someone else until a
    # condition nothing can detect -- the next ability check, the next Wisdom save
    # that would have failed -- and an Active Effect for that would linger on the
    # sheet through an hour of game time that never passes out of combat.
    "Amplify or Dampen Magic": {
        "atk": {"kind": "attack", "sort": 5, "atk": "melee",
                "name": "Melee spell attack (unwilling target)"},
        "amplify": {"kind": "utility", "sort": 10, "name": "Amplify",
                    "flavor": "The target takes, deals and restores "
                              "<strong>[[lookup @attributes.spell.mod]]</strong> more "
                              "with spells."},
        "dampen": {"kind": "utility", "sort": 20, "name": "Dampen",
                   "flavor": "The target takes, deals and restores "
                             "<strong>[[lookup @attributes.spell.mod]]</strong> less "
                             "with spells."},
    },
    "Demon Skin": {
        # The effect raises maximum hit points; nothing in dnd5e can raise *current*
        # ones, so the spell's "your current hit points and maximum each increase"
        # needs this button alongside it.
        "vigor": {"kind": "heal", "sort": 10, "name": "Fel vigor (+3 hit points)",
                  "heal": (None, None, "3 + (3 * (@item.level - 1))", None),
                  "flavor": "Your maximum already rose from the effect; this is the "
                            "matching gain to your current hit points."},
    },
    "Deathwyrm's Fury": {
        "frost": {"kind": "save", "sort": 10, "name": "Frostwyrm — cold (20 ft sphere)",
                  "save": "dex", "onsave": "half", "tpl": ("sphere", "20", None, None),
                  "dmg": [(5, 8, "cold", None), (5, 8, "necrotic", None)]},
        "vile": {"kind": "save", "sort": 20, "name": "Vilewyrm — acid (120 ft line)",
                 "save": "dex", "onsave": "half", "tpl": ("line", "120", "10", None),
                 "dmg": [(5, 8, "acid", None), (5, 8, "necrotic", None)]},
    },
    "Ice Nova": {
        # A tracker, not a creature: the ice has AC 10 and 40 hp, and breaking it is
        # how a restrained creature gets out. Count stays 1 and the DM clicks again
        # per restrained target -- no formula can know how many saves failed.
        "ice": {"kind": "summon", "sort": 10, "name": "Encase a creature in ice",
                "match": False,
                "profiles": [{"name": "Encasing Ice", "count": "1",
                              "uuid": SUMMON["Encasing Ice"]}],
                "flavor": "AC 10, 40 hit points. The restrained creature can instead "
                          "use its action for a Strength check against your spell DC."},
    },
    "Jaina's Flying Ship": {
        # The ship already exists in the fiction; this places a sheet so the party
        # can track its hit points and what they have loaded onto it.
        "ship": {"kind": "summon", "sort": 10, "name": "Place the ship's sheet",
                 "match": False,
                 "profiles": [{"name": "Enchanted Flying Ship", "count": "1",
                               "uuid": SUMMON["Enchanted Flying Ship"]}]},
    },
    "Conjure Undead": {
        # CR mode, so the player chooses any undead at or below the cap from the
        # content they own. @item.level is the slot the spell was cast at, and the
        # cap is CR 5 at 4th level rising by 1 per slot above.
        "summon": {"kind": "summon", "sort": 10, "name": "Conjure an undead",
                   "mode": "cr", "creatureTypes": ["undead"], "match": False,
                   "profiles": [{"name": "Undead", "count": "1",
                                 "cr": "1 + @item.level", "types": ["undead"]}],
                   "flavor": "Challenge rating 5 or lower, rising by 1 for each slot "
                             "level above 4th."},
    },

    "Touch of Chaos": {
        "beam2": {"kind": "attack", "sort": 10, "name": "Second beam (5th level)",
                  "dmg": [(1, 8, ["acid", "cold", "fire", "force", "lightning",
                                  "poison", "psychic", "thunder"], 1)]},
        "beam3": {"kind": "attack", "sort": 20, "name": "Third beam (11th level)",
                  "dmg": [(1, 8, ["acid", "cold", "fire", "force", "lightning",
                                  "poison", "psychic", "thunder"], 1)]},
        "beam4": {"kind": "attack", "sort": 30, "name": "Fourth beam (17th level)",
                  "dmg": [(1, 8, ["acid", "cold", "fire", "force", "lightning",
                                  "poison", "psychic", "thunder"], 1)]},
    },
}


def build_extra_activities(spell_id, name, activation):
    out = {}
    for key, spec in (EXTRA_ACTIVITIES.get(name) or {}).items():
        out.update(make_activity(make_id(spell_id, "act", key), spec, activation))
    return out


def build_spell(src):
    name = src["name"]
    spell_id = make_id("spell", name)
    desc = strip_statblock(name, src["description"])
    # Patch semantics, not replacement: an override names only the keys it wants to
    # correct, so fixing one spell's template doesn't mean restating its damage and
    # then having the two drift apart. Overrides that change the activity kind must
    # say so explicitly.
    mech = {**auto_detect(desc), **OVERRIDES.get(name.lower(), {}), **src.get("_split", {})}
    activation = src["activation"]

    tpl = None if name in NO_TEMPLATE else mech.get("tpl")
    if tpl:
        ttype, size, width, height = tpl
        target = {"affects": {"type": "", "count": "", "choice": False, "special": ""},
                  "template": {"count": "", "contiguous": False, "type": ttype,
                               "size": size, "width": width or "", "height": height or "",
                               "units": "ft"}}
    else:
        aff = "creature" if mech["kind"] in ("attack", "save", "heal") else ""
        target = {"affects": {"type": aff, "count": "1" if aff else "", "choice": False, "special": ""},
                  "template": {"count": "", "contiguous": False, "type": "", "size": "",
                               "width": "", "height": "", "units": ""}}

    rng = src["range"]
    system = {
        "description": {"value": desc, "chat": ""},
        "source": SRC,
        "activation": {"type": activation["type"], "condition": activation.get("condition", ""),
                       "value": activation["value"]},
        "duration": {"value": src["duration"].get("value", ""),
                     "units": src["duration"].get("units", "inst")},
        "target": target,
        "range": {"value": rng.get("value"), "units": rng.get("units", ""),
                  "special": rng.get("special", "")},
        "uses": {"max": "", "recovery": [], "spent": 0},
        "level": src["level"], "school": src["school"],
        "materials": {"value": src["material"], "consumed": False, "cost": 0, "supply": 0},
        "preparation": {"mode": "prepared", "prepared": False},
        "properties": src["properties"],
        "activities": {**build_activity(spell_id, mech, activation, name),
                       **build_alt_activity(spell_id, name, activation),
                       **build_extra_activities(spell_id, name, activation)},
        "identifier": slugify(name),
    }
    fname = _level_folder(src["level"])
    USED_SPELL_FOLDERS.add(fname)
    return {
        "_id": spell_id, "name": name, "type": "spell", "img": IMG,
        "system": system, "effects": build_effects(spell_id, name),
        "folder": folders.fid("Item", fname),
        "sort": 0, "ownership": {"default": 0}, "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!items!{spell_id}",
    }, mech["kind"]


def load_extras(src):
    """Merge in hand-curated spells from build/data/extra_spells.json.

    A few spells appear in the WC5E spell *tables* but never get a definition
    block in Chapter 6, so extract_spells.py can't produce them even though
    class features reference them. Those are transcribed by hand in the same
    intermediate shape and processed identically (auto_detect still derives the
    mechanics). If upstream ever defines one properly, the extracted version
    wins and the extra is ignored.
    """
    path = os.path.join(HERE, "data", "extra_spells.json")
    if not os.path.exists(path):
        return src
    have = {s["name"].lower() for s in src}
    added, superseded = [], []
    for rec in json.load(open(path, encoding="utf-8")):
        (superseded if rec["name"].lower() in have else added).append(rec["name"])
        if rec["name"].lower() not in have:
            src.append(rec)
    if added:
        print(f"  + {len(added)} hand-curated extras: {', '.join(added)}")
    if superseded:
        print(f"  - {len(superseded)} extras superseded by upstream: {', '.join(superseded)}")
    return src


def main():
    src = json.load(open(os.path.join(REPO, "intermediate", "wc5e_spells_src.json"),
                         encoding="utf-8"))
    src = load_extras(src)
    out_dir = os.path.join(REPO, "src", "spells")
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(out_dir, fn))
    from collections import Counter
    kinds = Counter()
    for s in src:
        item, kind = build_spell(s)
        kinds[kind] += 1
        with open(os.path.join(out_dir, slugify(s["name"]) + ".json"), "w",
                  encoding="utf-8") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
    for fname in USED_SPELL_FOLDERS:
        doc = folders.folder_doc("Item", fname)
        with open(os.path.join(out_dir, "_folder-" + slugify(fname) + ".json"),
                  "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(src)} spell items to {out_dir}")
    print("  activity kinds:", dict(kinds))
    if STRIPPED_STATBLOCKS:
        print("  stripped misplaced statblocks from:", ", ".join(STRIPPED_STATBLOCKS))


if __name__ == "__main__":
    main()
