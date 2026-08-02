#!/usr/bin/env python3
"""Extract ALL WC5E custom spells from the (most complete) WIP Chapter 6 spell
list into intermediate/wc5e_spells_src.json: header fields
(level/school/time/range/components/duration) + full description HTML. Activity
mechanics are derived in build_spells.py.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(REPO), "Warcraft-5e-Conversion",
                   "WIP 3.0 Chapters", "Chapter 6 Spells.md")

SCHOOL = {"abjuration": "abj", "conjuration": "con", "divination": "div",
          "enchantment": "enc", "evocation": "evo", "illusion": "ill",
          "necromancy": "nec", "transmutation": "trs"}


def clean(t):
    t = re.sub(r"<!--.*?-->", "", t, flags=re.DOTALL)
    t = t.replace("&shy;", "").replace("­", "").replace("’", "'")
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.I)
    t = re.sub(r"<div[^>]*>|</div>|\\columnbreak|\\pagebreakNum", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    return t.strip()


def md_html(text):
    t = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)
    return t


def parse_level_school(line):
    s = line.strip().strip("*").strip().lower()
    ritual = "ritual" in s
    s = s.replace("(ritual)", "").strip()
    if "cantrip" in s:
        return 0, next((v for k, v in SCHOOL.items() if k in s), "evo"), ritual
    m = re.match(r"(\d+)(?:st|nd|rd|th)[- ]level\s+(\w+)", s)
    if m:
        return int(m.group(1)), SCHOOL.get(m.group(2), "evo"), ritual
    return None, None, ritual


def parse_range(v):
    v = v.strip(); low = v.lower()
    special = v[v.index("(") + 1:v.rindex(")")] if "(" in v and ")" in v else ""
    if low.startswith("self"):
        return {"value": None, "units": "self", "special": special}
    if low.startswith("touch"):
        return {"value": None, "units": "touch", "special": special}
    if low.startswith(("sight", "unlimited", "special")):
        return {"value": None, "units": "spec", "special": v}
    m = re.match(r"(\d+)", v)
    return {"value": m.group(1) if m else None, "units": "ft" if m else "",
            "special": special}


def parse_components(v):
    material = ""
    mm = re.search(r"M\s*\(([^)]*)\)", v)
    if mm:
        material = mm.group(1).strip()
    props = []
    if re.search(r"\bV\b", v): props.append("vocal")
    if re.search(r"\bS\b", v): props.append("somatic")
    if re.search(r"\bM\b", v): props.append("material")
    return props, material


def parse_duration(v):
    low = v.strip().lower()
    conc = "concentration" in low
    if "instant" in low:
        return {"units": "inst", "value": "", "concentration": False}
    m = re.search(r"(\d+)\s*(round|minute|hour|day)", low)
    if m:
        return {"units": m.group(2), "value": m.group(1), "concentration": conc}
    return {"units": "inst", "value": "", "concentration": conc}


def main():
    raw = open(SRC, encoding="utf-8").read().split("\n")
    lines = [l.lstrip() for l in raw]   # strip the 2-space indentation

    # split into #### blocks
    blocks = []
    cur_name, buf = None, []
    for l in lines:
        m = re.match(r"^#### (.+)", l)
        if m:
            if cur_name:
                blocks.append((cur_name, buf))
            cur_name, buf = m.group(1).strip(), []
        elif cur_name is not None:
            buf.append(l)
    if cur_name:
        blocks.append((cur_name, buf))

    out = []
    for name, b in blocks:
        idx = 0
        while idx < len(b) and not b[idx].strip():
            idx += 1
        if idx >= len(b):
            continue
        level, school, ritual = parse_level_school(b[idx])
        if level is None:      # not a spell definition (no "* level school *")
            continue
        rec = {"name": clean(name).replace("'", "'"), "level": level,
               "school": school, "ritual": ritual,
               "activation": {"type": "action", "value": 1, "condition": ""},
               "range": {}, "properties": [], "material": "",
               "duration": {}, "description": ""}
        desc = []
        for l in b[idx + 1:]:
            s = l.strip()
            fm = re.match(r"-\s*\*\*(.+?):\*\*\s*(.*)", s)
            if fm:
                label, val = fm.group(1).strip().lower(), fm.group(2).strip()
                if label == "casting time":
                    lv = val.lower()
                    if "bonus action" in lv:
                        rec["activation"] = {"type": "bonus", "value": 1, "condition": ""}
                    elif "reaction" in lv:
                        cond = val.split(",", 1)[1].strip() if "," in val else ""
                        rec["activation"] = {"type": "reaction", "value": 1, "condition": cond}
                    elif "minute" in lv:
                        n = re.match(r"(\d+)", val)
                        rec["activation"] = {"type": "minute", "value": int(n.group(1)) if n else 1, "condition": ""}
                    elif "hour" in lv:
                        n = re.match(r"(\d+)", val)
                        rec["activation"] = {"type": "hour", "value": int(n.group(1)) if n else 1, "condition": ""}
                    else:
                        rec["activation"] = {"type": "action", "value": 1, "condition": ""}
                elif label == "range":
                    rec["range"] = parse_range(val)
                elif label == "components":
                    rec["properties"], rec["material"] = parse_components(val)
                elif label == "duration":
                    rec["duration"] = parse_duration(val)
            elif re.match(r"^_+$", s) or s.startswith(("<div", "<img")):
                if desc and desc[-1] != "":
                    desc.append("")
            elif not s:
                if desc and desc[-1] != "":
                    desc.append("")
            else:
                desc.append(clean(s))
        # paragraphs
        paras, cp = [], []
        for d in desc:
            if d == "":
                if cp: paras.append(" ".join(cp)); cp = []
            else:
                cp.append(d)
        if cp:
            paras.append(" ".join(cp))
        rec["description"] = "".join(f"<p>{md_html(p)}</p>" for p in paras if p)
        if not rec["range"]:
            rec["range"] = {"value": None, "units": "", "special": ""}
        if not rec["duration"]:
            rec["duration"] = {"units": "inst", "value": "", "concentration": False}
        if rec["ritual"]:
            rec["properties"].append("ritual")
        if rec["duration"].get("concentration"):
            rec["properties"].append("concentration")
        out.append(rec)

    # de-dup by name (keep first)
    seen, uniq = set(), []
    for r in out:
        k = r["name"].lower()
        if k in seen:
            continue
        seen.add(k); uniq.append(r)

    with open(os.path.join(REPO, "intermediate", "wc5e_spells_src.json"), "w",
              encoding="utf-8") as f:
        json.dump(uniq, f, indent=2, ensure_ascii=False)
    print(f"Extracted {len(uniq)} WC5E spells -> wc5e_spells_src.json")


if __name__ == "__main__":
    main()
