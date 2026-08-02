#!/usr/bin/env python3
"""
extract_pdfs.py -- Turn the WC5E class PDFs into committed plain text so the
build can read the *current* rules.

The GitHub repo lags the PDFs. The authors work in GMBinder and export PDFs to
their Drive; the repo is a periodically-synced mirror. Concretely: the Rogue PDF
replaced the Subtlety third-caster design with "Subtle Magic", and the string
"Subtle Magic" appears nowhere in the repo -- not on master, not on the HHB-v3.1
tag. Version numbers differ per class too (Mage 3.1, Priest 3.1.1, the rest 3.0),
which the repo doesn't express at all.

The PDFs themselves are ~145 MB and aren't ours to redistribute, so they stay out
of the repo. What gets committed is the extracted text under intermediate/pdf/,
which is small, diffable (so a new PDF drop shows up as a reviewable change), and
means a normal build needs neither the PDFs nor poppler installed.

Requires `pdftotext` (poppler-utils) and the PDFs, by default in
../wc5e-class-pdfs/ -- override with WC5E_PDF_DIR.

    pdftotext -layout preserves the column alignment the class tables rely on;
    without -layout the Features column interleaves with the slot numbers.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_DIRS = [
    os.environ.get("WC5E_PDF_DIR", ""),
    os.path.join(os.path.dirname(REPO), "wc5e-class-pdfs"),
    os.path.expanduser("~/Downloads/wc5e-class-pdfs"),
]
OUT = os.path.join(REPO, "intermediate", "pdf")

# "Death Knight v3 (3.0).pdf" -> ("Death Knight", "3.0")
NAME_RE = re.compile(r"^(?P<cls>.+?)\s+v\d+\s*\((?P<ver>[\d.]+)\)\.pdf$", re.IGNORECASE)


def find_dir():
    for d in DEFAULT_DIRS:
        if d and os.path.isdir(d):
            return d
    return None


def main():
    if not shutil.which("pdftotext"):
        sys.exit("  pdftotext not found -- install poppler-utils, or skip this step:\n"
                 "  intermediate/pdf/ is committed, so a normal build doesn't need it.")
    src = find_dir()
    if not src:
        sys.exit("  no PDF directory found. Set WC5E_PDF_DIR, or place the class PDFs in\n"
                 "  ../wc5e-class-pdfs/. intermediate/pdf/ is committed, so this is optional.")

    os.makedirs(OUT, exist_ok=True)
    manifest, skipped = {}, []
    for fn in sorted(os.listdir(src)):
        if not fn.lower().endswith(".pdf"):
            continue
        m = NAME_RE.match(fn)
        if not m:
            skipped.append(fn)
            continue
        cls, ver = m.group("cls").strip(), m.group("ver")
        dest = os.path.join(OUT, cls.replace(" ", "_") + ".txt")
        r = subprocess.run(["pdftotext", "-layout", os.path.join(src, fn), dest],
                           capture_output=True, text=True)
        if r.returncode != 0:
            skipped.append(f"{fn} (pdftotext failed: {r.stderr.strip()[:60]})")
            continue
        with open(dest, encoding="utf-8", errors="replace") as f:
            lines = sum(1 for _ in f)
        manifest[cls] = {"version": ver, "pdf": fn, "lines": lines}

    with open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  extracted {len(manifest)} class PDFs from {src}")
    for cls, info in sorted(manifest.items()):
        print(f"    {cls:14s} v{info['version']:6s} {info['lines']:5d} lines")
    if skipped:
        print(f"  skipped: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
