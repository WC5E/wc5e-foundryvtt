#!/usr/bin/env python3
"""
build_spell_progression.py -- Give WC5E casters a real "choose your spells"
step on level-up by generating dnd5e `ItemChoice` advancements from the
Cantrips Known / Spells Known columns of the upstream class tables.

Why this exists: dnd5e has no built-in prompt for learning cantrips or spells.
Its own SRD classes don't use one either -- a Wizard is expected to add spells
from the spellbook by hand -- and guided character builders hardcode the
progression per SRD class, so a custom class gets skipped entirely. dnd5e *does*
support prompted choices through the ItemChoice advancement (that is how Mystic
Arcanum and the cantrip fighting styles work), so we can drive it from data and
end up better automated than the SRD classes.

Reads the class tables from the upstream conversion, preferring the newer
"WIP 3.0 Classes" files over the Heroes Handbook, and writes advancements into
the hand-maintained class documents in src/classes/.

Idempotent: every generated advancement gets a deterministic id derived from
(class, kind, level), and each run removes the whole candidate id set before
re-inserting, so re-running updates rather than duplicating. Hand-authored
advancements are never touched.
"""
import json
import os
import re
import hashlib
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
UPSTREAM = os.path.join(os.path.dirname(REPO), "Warcraft-5e-Conversion")
WIP_DIR = os.path.join(UPSTREAM, "WIP 3.0 Classes")
HHB = os.path.join(UPSTREAM, "Heroes Handbook, Main File.txt")

CASTERS = ["Death Knight", "Druid", "Mage", "Paladin", "Priest", "Shaman", "Warlock"]

# Casters whose spell learning lives in prose rather than a table column, so
# `column_by_level` can't see it. The Mage is a spellbook caster:
#   "You have a spellbook containing six 1st-level mage spells of your choice."
#   "Each time you gain a mage level, you add two mage spells of your choice."
# Priest and Druid deliberately get nothing here -- they prepare from the entire
# class list ("choosing from the priest spell list"), so there is no learning
# step at all, only cantrips.
SPELLBOOK = {
    "Mage": {"initial": 6, "per_level": 2},
}

# Casters that prepare from the entire class list rather than learning a fixed
# set, so there is no Spells Known column to read and nothing for this stage to
# generate. Priest and Druid still get cantrips; the Paladin gets neither.
PREPARED = {"Paladin", "Priest", "Druid"}

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def make_id(*p):
    n = int.from_bytes(hashlib.sha1("::".join(map(str, p)).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))


ORDINAL = re.compile(r"^\s*(\d{1,2})\s*(?:st|nd|rd|th)\s*$", re.IGNORECASE)


def cells(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


def clean_head(h):
    h = re.sub(r"<div.*?</div>", "", h, flags=re.DOTALL)
    h = re.sub(r"<br\s*/?>", " ", h, flags=re.IGNORECASE)
    h = re.sub(r"<[^>]+>", "", h)
    return re.sub(r"\s+", " ", h.replace("&nbsp;", " ")).strip().lower()


def parse_tables(text):
    """Yield (headers, rows) for every markdown table that has a level column."""
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if not lines[i].lstrip().startswith("|"):
            i += 1
            continue
        block = []
        while i < len(lines) and lines[i].lstrip().startswith("|"):
            block.append(lines[i])
            i += 1
        if len(block) < 3:
            continue
        head = [clean_head(c) for c in cells(block[0])]
        if not head or "level" not in head[0]:
            continue
        rows = [cells(r) for r in block[2:]]
        yield head, rows


def column_by_level(text, wanted):
    """-> {level: count} for the first table carrying the `wanted` header."""
    for head, rows in parse_tables(text):
        idx = next((n for n, h in enumerate(head) if wanted in h), None)
        if idx is None:
            continue
        out = {}
        for r in rows:
            if len(r) <= idx:
                continue
            m = ORDINAL.match(re.sub(r"<[^>]+>", "", r[0]))
            if not m:
                continue
            val = re.sub(r"<[^>]+>|&nbsp;", "", r[idx]).strip()
            if val in ("—", "-", "", "–"):
                out[int(m.group(1))] = 0
            elif val.isdigit():
                out[int(m.group(1))] = int(val)
        if out:
            return out
    return {}


def class_sources(cls):
    """Yield (text, origin) candidates, best first.

    Some WIP 3.0 class files carry the prose but not the table -- Warlock.md has
    no markdown tables at all -- so a candidate that yields no usable column has
    to fall through to the Heroes Handbook rather than ending the search.
    """
    for name in (cls, f"{cls}.md"):
        p = os.path.join(WIP_DIR, name)
        if os.path.isfile(p):
            yield open(p, encoding="utf-8", errors="replace").read(), f"WIP 3.0 Classes/{name}"
    text = open(HHB, encoding="utf-8", errors="replace").read()
    # Narrow to this class's section so we can't pick up a neighbouring table.
    m = re.search(rf"^#+\s*(?:Chapter\s*\d+:\s*)?{re.escape(cls)}\s*$", text,
                  re.MULTILINE | re.IGNORECASE)
    if m:
        nxt = re.search(r"^##\s+\S", text[m.end():], re.MULTILINE)
        yield text[m.end():m.end() + (nxt.start() if nxt else 40000)], "Heroes Handbook"


def load_progression(cls):
    """-> (cantrips_by_level, spells_by_level, origin) from the best candidate."""
    for text, origin in class_sources(cls):
        cantrips = column_by_level(text, "cantrips known")
        known = column_by_level(text, "spells known")
        if cantrips or known:
            return cantrips, known, origin
    return {}, {}, None


def deltas(by_level):
    """{level: count} -> {level: increase} keeping only levels that gain one."""
    out, prev = {}, 0
    for lv in sorted(by_level):
        cur = by_level[lv]
        if cur > prev:
            out[lv] = cur - prev
        prev = max(prev, cur)
    return out


TITLES = {"cantrip": "Cantrips Known", "spell": "Spells Known", "spellbook": "Spellbook"}




def item_choice(cls, ident, kind, picks):
    """ONE ItemChoice advancement covering every level at which `kind` is picked.

    `picks` is {class level: number gained}. All of them belong in a single
    advancement's `choices` map, which is what that field is for -- "specify how
    many choices are allowed at each level".

    Two things this buys, and one it does not.

    It shows the player what they already picked: ItemChoiceFlow builds
    `context.sections` from `value.added` for every earlier level *of the same
    advancement*, so with one advancement the level 2 picks appear above the level
    3 choice. Split across ten advancements each has its own empty `value.added`
    and every level looks like the first.

    It also makes "you can replace one of the spells you know" work. `value.replaced`
    points at a level within the same advancement, so with one advancement per
    level there is nothing earlier to swap out.

    It does NOT stop the same spell being picked twice. dnd5e computes a
    `previouslySelected` set in that flow and then never reads it -- three
    references in the whole system, all writes, and it is not passed to the
    template. Nothing in `apply()` rejects a duplicate either. Preventing it needs
    a runtime hook; the pool below cannot, being static build-time data that knows
    nothing about a particular character.

    The advancement keeps the id of its FIRST level so existing characters do not
    lose the picks they have already recorded against it.
    """
    first = min(picks)
    total = sum(picks.values())
    if kind == "cantrip":
        hint = f"Choose your cantrips from the {cls} spell list as you gain them."
    elif kind == "spellbook":
        hint = (f"Add spells of your choice to your spellbook from the {cls} spell "
                f"list as you gain levels.")
    else:
        hint = (f"Learn new spells from the {cls} spell list as you gain levels "
                f"({total} in total by 20th).")
    return OrderedDict([
        ("_id", make_id("spellprog", cls, kind, first)),
        ("type", "ItemChoice"),
        ("title", TITLES[kind]),
        ("hint", hint),
        ("configuration", OrderedDict([
            ("allowDrops", True),
            # Only known casters may swap a spell on level-up ("you can replace one
            # of the spells you know"). Cantrips are fixed, and a spellbook is only
            # ever added to.
            ("choices", {str(lv): {"count": n, "replacement": kind == "spell"}
                         for lv, n in sorted(picks.items())}),
            # Always empty. An explicit pool was tried in v1.18.2 to keep cantrips
            # out of Spells Known and had to come straight back out: a pool is a
            # build-time snapshot, while `restriction.list` is resolved live
            # through dnd5e.registry.spellLists against the class's spell-list
            # page -- the page the auto-assign tool fills with the GM's own
            # non-SRD spells. The pool could never see those, so the Shaman's
            # level 1 choice fell to the nine 1st-level spells that happen to
            # resolve at build time. Leave this empty; the live list is the point.
            ("pool", []),
            # "0" restricts to cantrips; "available" lets the player pick any spell
            # level they currently have slots for, which is what "Spells Known"
            # means. Note "available" sets only a maximum, so it does not exclude
            # cantrips from a Spells Known choice -- dnd5e has no "1 to max" option.
            ("restriction", {"type": "spell", "subtype": "",
                             "level": "0" if kind == "cantrip" else "available",
                             "list": [f"class:{ident}"]}),
            ("spell", {"ability": [], "preparation": "",
                       "uses": {"max": "", "per": ""}}),
            ("type", "spell"),
        ])),
        ("value", {"added": {}, "replaced": {}}),
    ])


def main():
    if not os.path.isdir(UPSTREAM):
        raise SystemExit(f"upstream source not found: {UPSTREAM}")

    # class name -> (file path, identifier, doc)
    docs = {}
    for fn in os.listdir(os.path.join(REPO, "src", "classes")):
        if not fn.endswith(".json"):
            continue
        p = os.path.join(REPO, "src", "classes", fn)
        d = json.load(open(p, encoding="utf-8"))
        if d.get("type") == "class":
            docs[d["name"]] = (p, d["system"].get("identifier"), d)

    report = []
    for cls in CASTERS:
        if cls not in docs:
            report.append((cls, None, "no class document", {}, {}, 0))
            continue
        path, ident, doc = docs[cls]
        cantrip_totals, known_totals, origin = load_progression(cls)
        if not origin:
            report.append((cls, None, "no table found", {}, {}, 0))
            continue
        cantrips = deltas(cantrip_totals)
        known = deltas(known_totals)

        adv = doc["system"].setdefault("advancement", [])
        # drop everything this script could have produced, then re-add
        mine = {make_id("spellprog", cls, k, lv)
                for k in ("cantrip", "spell", "spellbook") for lv in range(1, 21)}
        kept = [a for a in adv if a.get("_id") not in mine]
        new = []
        if cantrips:
            new.append(item_choice(cls, ident, "cantrip", cantrips))
        if known:
            new.append(item_choice(cls, ident, "spell", known))
        book = SPELLBOOK.get(cls)
        if book:
            new.append(item_choice(cls, ident, "spellbook",
                                   {1: book["initial"],
                                    **{lv: book["per_level"] for lv in range(2, 21)}}))
        doc["system"]["advancement"] = kept + new
        json.dump(doc, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        open(path, "a", encoding="utf-8").write("\n")
        report.append((cls, origin, f"{len(kept)} kept", cantrips, known,
                       1 if SPELLBOOK.get(cls) else 0))

    print("  class          source                          cantrip picks        spell picks              book")
    for cls, origin, note, cantrips, known, *rest in report:
        book = rest[0] if rest else 0
        c = ", ".join(f"L{l}+{n}" for l, n in sorted(cantrips.items())) or "—"
        s = ", ".join(f"L{l}+{n}" for l, n in sorted(known.items())) or "—"
        print(f"  {cls:14s} {str(origin):31s} {c[:20]:20s} {s[:24]:24s} {book or '—'}")
        if not cantrips and not known:
            # A prepared caster has no Cantrips/Spells Known columns to find: it
            # prepares from the whole class list, so nothing here is a bug. Saying
            # "!!" at one invites a future session to "fix" it by inventing a
            # progression the class does not have.
            if cls in PREPARED:
                print(f"      (prepared caster -- nothing to generate)")
            else:
                print(f"      !! nothing generated ({note})")


if __name__ == "__main__":
    main()
