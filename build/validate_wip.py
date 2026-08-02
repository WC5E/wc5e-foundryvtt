#!/usr/bin/env python3
"""Validate the parsed WIP monsters: flag incomplete/fucky entries and detect
overlaps with the finished Main File bestiary. Read-only reporting."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
INTER = os.path.join(REPO, "intermediate")

main = json.load(open(os.path.join(INTER, "monsters.json"), encoding="utf-8"))
wip = json.load(open(os.path.join(INTER, "monsters_wip.json"), encoding="utf-8"))

main_names = {m["name"].lower() for m in main}

def flags_for(m):
    f = []
    ab = m["abilities"]
    if all(ab.get(k, 10) == 10 for k in ["str", "dex", "con", "int", "wis", "cha"]):
        f.append("no-abilities")
    if m["ac"] == 10 and not m["ac_note"]:
        f.append("default-AC(10)")
    if m["hp"] == 1 and not m["hp_formula"]:
        f.append("default-HP(1)")
    if not m["hp_formula"]:
        f.append("no-HP-formula")
    if m["cr"] == 0.0:
        f.append("CR-0/missing")
    if not m["size"]:
        f.append("no-size")
    if not m["type"]:
        f.append("no-type")
    if not m["actions"]:
        f.append("no-actions")
    if not m["speed"] or m["speed"].get("walk", 0) == 0 and not any(
            m["speed"].get(k, 0) for k in ["fly", "swim", "climb", "burrow"]):
        f.append("no-speed")
    # over-long feature text -> maybe captured narrative
    for sec in ["traits", "actions", "reactions", "legendary"]:
        for ft in m[sec]:
            if len(ft["text"]) > 1500:
                f.append(f"long-text({sec})")
                break
    return f


# duplicate names within WIP
from collections import Counter
wip_name_counts = Counter(m["name"] for m in wip)
dups = {k: v for k, v in wip_name_counts.items() if v > 1}

overlaps = [m["name"] for m in wip if m["name"].lower() in main_names]

overlap_lc = {n.lower() for n in overlaps}
# only consider NET-NEW monsters (WIP copies of Main File entries are skipped)
net_new = [m for m in wip if m["name"].lower() not in overlap_lc]

clean, flagged = [], []
for m in net_new:
    fl = flags_for(m)
    (flagged if fl else clean).append((m, fl))

print(f"WIP monsters: {len(wip)} | net-new (after skipping overlaps): {len(net_new)}")
print(f"  net-new clean: {len(clean)} | net-new flagged: {len(flagged)}")
print(f"Overlaps with Main File (skipped): {len(overlaps)}")
print(f"Duplicate names within WIP: {dups}")
print()
print("=== NET-NEW FLAGGED (by source file) ===")
by_file = {}
for m, fl in flagged:
    by_file.setdefault(m["source_file"], []).append((m["name"], fl))
for src in sorted(by_file):
    print(f"\n-- {src} --")
    for name, fl in by_file[src]:
        print(f"   {name:32s} {', '.join(fl)}")
