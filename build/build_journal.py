#!/usr/bin/env python3
"""Build the module's 'Read Me' JournalEntry (welcome + roadmap + credits) into
src/generated/journals/ for the journals compendium."""
import json
import os
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
JOURNAL_SOURCE_DIR = os.path.join(REPO, "reference", "journals")

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def mkid(*p):
    n = int.from_bytes(hashlib.sha1("::".join(p).encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))

STATS = {"systemId": "dnd5e", "systemVersion": "5.3.3"}

def load_page_content(filename):
    path = os.path.join(JOURNAL_SOURCE_DIR, filename)
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    except OSError as exc:
        raise RuntimeError(f"Unable to read journal source {path}: {exc}") from exc


def page(journal_id, name, html, sort):
    pid = mkid(journal_id, name)
    return {
        "_id": pid, "name": name, "type": "text",
        "title": {"show": True, "level": 1},
        "text": {"content": html.strip(), "format": 1, "markdown": ""},
        "image": {}, "video": {"controls": True, "volume": 0.5}, "src": None,
        "system": {}, "sort": sort, "ownership": {"default": -1}, "flags": {},
        "_stats": STATS,
        "_key": f"!journal.pages!{journal_id}.{pid}",
    }


def main():
    jid = mkid("journal", "wc5e-readme")
    entry = {
        "_id": jid, "name": "Warcraft 5e — Read Me",
        "pages": [
            page(jid, "Welcome", load_page_content("welcome.html"), 100000),
            page(jid, "Roadmap", load_page_content("roadmap.html"), 200000),
            page(jid, "Credits & License", load_page_content("credits.html"), 300000),
        ],
        "folder": None, "sort": 0, "ownership": {"default": 0}, "flags": {},
        "_stats": STATS, "_key": f"!journal!{jid}",
    }
    out_dir = os.path.join(REPO, "src", "generated", "journals")
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(out_dir, fn))
    with open(os.path.join(out_dir, "readme.json"), "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)
    print(f"Wrote journal 'Warcraft 5e — Read Me' ({len(entry['pages'])} pages)")


if __name__ == "__main__":
    main()
