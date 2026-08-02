#!/usr/bin/env python3
"""
parse.py -- Extract 5e statblocks from the WC5e "Manual of Monsters" Homebrewery
markdown into a clean intermediate JSON (one object per monster).

Input : the GMBinder/Homebrewery .txt source file(s)
Output: intermediate/monsters.json  (a list of monster dicts)

This does NOT know anything about Foundry. It just faithfully parses the
statblock text. build_actors.py turns the intermediate into dnd5e actors.
"""
import json
import re
import sys
import os

# ---------------------------------------------------------------------------
# Text cleanup helpers
# ---------------------------------------------------------------------------

def strip_bq(line: str) -> str:
    """Remove a leading blockquote marker '>' (with optional spaces)."""
    # matches '>', '> ', '>  ', etc.
    return re.sub(r'^\s*>\s?', '', line)


def clean_inline(text: str) -> str:
    """Clean Homebrewery/HTML noise out of a run of text, keeping it readable
    as plain-ish text. Foundry descriptions accept HTML, but we normalise the
    quirky bits here."""
    if text is None:
        return ''
    t = text
    # Drop CR-calculator comments and any HTML comments
    t = re.sub(r'<!--.*?-->', '', t, flags=re.DOTALL)
    # soft hyphen used purely for typesetting
    t = t.replace('&shy;', '')
    t = t.replace('­', '')
    # non-breaking spaces -> normal spaces
    t = t.replace('&nbsp;', ' ').replace(' ', ' ')
    # <br> line breaks -> space (we re-flow text)
    t = re.sub(r'<br\s*/?>', ' ', t, flags=re.IGNORECASE)
    # stray manual-typeset spans like <span ...></span>
    t = re.sub(r'<span[^>]*>', '', t, flags=re.IGNORECASE)
    t = re.sub(r'</span>', '', t, flags=re.IGNORECASE)
    # collapse whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def md_bold_italics_to_html(text: str) -> str:
    """Convert markdown ***x*** / **x** / *x* to <strong>/<em> so the text
    renders nicely in Foundry's HTML description fields."""
    t = text
    t = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'\*(.+?)\*', r'<em>\1</em>', t)
    return t


# ---------------------------------------------------------------------------
# Statblock extraction
# ---------------------------------------------------------------------------

LAYOUT_RE = re.compile(
    r'^\s*($|\\column|\\page|\\pagebreak|<div|</div|<img|<style|</style|'
    r'<span|</span|<a |</a>|\{\{|\}\})', re.IGNORECASE)


def is_layout(line: str) -> bool:
    """True for GMBinder layout/macro/HTML noise that separates statblock
    columns but is not statblock content and not narrative."""
    return bool(LAYOUT_RE.match(line))


def heal_blockquotes(lines):
    """Some statblocks have author typos: a wrapped line inside the blockquote
    is missing its leading '>'. This truncates the block. Reattach any such
    stray continuation line (non-'>' line sandwiched between '>' lines)."""
    healed = list(lines)
    for i, raw in enumerate(healed):
        if raw.lstrip().startswith('>'):
            continue
        s = raw.strip()
        if not s or is_layout(raw):
            continue
        # markdown heading = real narrative, never heal
        if s.startswith('#'):
            continue
        # previous line must be blockquote
        if i == 0 or not healed[i - 1].lstrip().startswith('>'):
            continue
        # the next non-blank line must resume the blockquote (within a couple
        # lines) before any heading/hard break
        j = i + 1
        resumes = False
        while j < len(healed) and j <= i + 3:
            nxt = healed[j]
            ns = nxt.strip()
            if not ns:
                j += 1
                continue
            if nxt.lstrip().startswith('>'):
                resumes = True
            break
        if resumes:
            healed[i] = '> ' + raw
    return healed


def extract_statblocks(lines):
    """Yield lists-of-lines, one per statblock.

    A statblock starts at a '> ## Name' run that contains '**Armor Class**'.
    Column-split statblocks (a second '>' run with no name, separated from the
    first only by layout noise) are merged back in as continuations."""
    lines = heal_blockquotes(lines)

    # Build ordered list of runs, each tagged with whether the gap separating
    # it from the previous run was layout-only.
    runs = []          # list of dicts: {lines, sep_layout_only}
    cur = []
    sep_lines = []     # non-blockquote lines since previous run ended
    for raw in lines:
        if raw.lstrip().startswith('>'):
            if not cur:
                sep_layout_only = all(is_layout(x) for x in sep_lines)
                runs.append({'lines': cur, 'sep_layout_only': sep_layout_only})
            cur.append(raw)
        else:
            if cur:
                cur = []
                sep_lines = []
            sep_lines.append(raw)
    # cur is the same list object stored in the last run dict, so it is already
    # populated; drop any empty placeholder just in case.
    runs = [r for r in runs if r['lines']]

    def is_start(run_lines):
        j = '\n'.join(run_lines)
        return (re.search(r'^\s*>\s*##\s+\S', j, re.MULTILINE)
                and 'Armor Class' in j)

    def is_continuation(run_lines):
        """A statblock tail: no name header, but has action/feature content."""
        j = '\n'.join(strip_bq(x) for x in run_lines)
        if re.search(r'^\s*##\s+\S', j, re.MULTILINE):
            return False
        if re.search(r'^\s*###\s+(Actions|Reactions|Legendary)', j, re.MULTILINE | re.IGNORECASE):
            return True
        # feature-lead only (traits continued): a bold ***Name.*** lead
        if re.search(r'^\s*\*\*\*?.+?\.?\*\*\*?', j, re.MULTILINE):
            return True
        # pure divider/blank tail
        if all(not strip_bq(x).strip() or re.match(r'^_+$', strip_bq(x).strip())
               for x in run_lines):
            return True
        return False

    current = None
    for r in runs:
        rl = r['lines']
        if is_start(rl):
            if current is not None:
                yield current
            current = list(rl)
        elif (current is not None and r['sep_layout_only']
              and is_continuation(rl)):
            current.extend(rl)
        else:
            # unrelated blockquote (sidebar, rules text) -> close current
            if current is not None:
                yield current
                current = None
    if current is not None:
        yield current


# ---------------------------------------------------------------------------
# Field parsers
# ---------------------------------------------------------------------------

SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']

def parse_type_line(text):
    """'Huge plant, neutral good' -> (size, type, subtype, alignment)."""
    t = clean_inline(text).strip().strip('*').strip()
    size = ''
    ctype = ''
    subtype = ''
    align = ''
    # split on first comma -> "<size type>", "<alignment>"
    if ',' in t:
        left, align = t.split(',', 1)
        align = align.strip()
    else:
        left = t
    left = left.strip()
    words = left.split()
    if words and words[0].lower() in SIZES:
        size = words[0].lower()
        rest = ' '.join(words[1:])
    else:
        rest = left
    # subtype in parentheses: "humanoid (orc)"
    m = re.match(r'([A-Za-z ]+?)\s*\(([^)]+)\)', rest)
    if m:
        ctype = m.group(1).strip().lower()
        subtype = m.group(2).strip()
    else:
        ctype = rest.strip().lower()
    return size, ctype, subtype, align


def parse_ac(text):
    """'15 (natural armor)' -> (15, 'natural armor')."""
    t = clean_inline(text)
    m = re.search(r'(\d+)', t)
    val = int(m.group(1)) if m else 10
    note = ''
    mp = re.search(r'\(([^)]*)\)', t)
    if mp:
        note = mp.group(1).strip()
    return val, note


def parse_hp(text):
    """'105 (10d12 + 40)' -> (105, '10d12 + 40')."""
    t = clean_inline(text)
    m = re.search(r'(\d+)', t)
    val = int(m.group(1)) if m else 1
    formula = ''
    mp = re.search(r'\(([^)]*)\)', t)
    if mp:
        formula = mp.group(1).strip().replace('–', '-').replace('−', '-')
    return val, formula


def parse_speed(text):
    """'30 ft., fly 60 ft. (hover)' -> dict of movement types."""
    t = clean_inline(text).lower()
    speeds = {'walk': 0, 'fly': 0, 'swim': 0, 'climb': 0, 'burrow': 0, 'hover': False}
    # accept both "30 ft." and "30 feet"
    FT = r'\s*(\d+)\s*f(?:t|eet)'
    # leading plain number is walk
    m = re.match(FT, t)
    if m:
        speeds['walk'] = int(m.group(1))
    for kind in ['fly', 'swim', 'climb', 'burrow']:
        mm = re.search(kind + FT, t)
        if mm:
            speeds[kind] = int(mm.group(1))
    if 'hover' in t:
        speeds['hover'] = True
    return speeds


ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

def parse_abilities(cells):
    """['21 (+5)', '8 (-1)', ...] (6 cells) -> {'str':21, ...}."""
    out = {}
    for key, cell in zip(ABILITY_KEYS, cells):
        m = re.search(r'(\d+)', cell)
        out[key] = int(m.group(1)) if m else 10
    return out


CR_FRACTIONS = {'0': 0.0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5}

def parse_cr(text):
    t = clean_inline(text)
    m = re.match(r'\s*([0-9/]+)', t)
    if not m:
        return 0.0
    tok = m.group(1)
    if tok in CR_FRACTIONS:
        return CR_FRACTIONS[tok]
    try:
        return float(tok)
    except ValueError:
        return 0.0


def parse_senses(text):
    """Return dict with darkvision/blindsight/tremorsense/truesight ints and
    passive perception + any special text."""
    t = clean_inline(text)
    out = {'darkvision': 0, 'blindsight': 0, 'tremorsense': 0, 'truesight': 0,
           'passive': None, 'special': ''}
    for kind in ['darkvision', 'blindsight', 'tremorsense', 'truesight']:
        mm = re.search(kind + r'\s*(\d+)\s*ft', t, re.IGNORECASE)
        if mm:
            out[kind] = int(mm.group(1))
    mp = re.search(r'passive Perception\s*(\d+)', t, re.IGNORECASE)
    if mp:
        out['passive'] = int(mp.group(1))
    return out


def split_commas(text):
    """Split a comma/semicolon list, cleaning each item."""
    t = clean_inline(text)
    parts = re.split(r'[;,]', t)
    return [p.strip() for p in parts if p.strip()]


def parse_saves(text):
    """'Wis +8, Con +5' -> {'wis': 8, 'con': 5}."""
    out = {}
    for item in split_commas(text):
        m = re.match(r'([A-Za-z]{3})\w*\s*([+-]?\d+)', item)
        if m:
            abbr = m.group(1).lower()[:3]
            if abbr in ABILITY_KEYS:
                out[abbr] = int(m.group(2))
    return out


SKILL_MAP = {
    'acrobatics': 'acr', 'animal handling': 'ani', 'arcana': 'arc',
    'athletics': 'ath', 'deception': 'dec', 'history': 'his',
    'insight': 'ins', 'intimidation': 'itm', 'investigation': 'inv',
    'medicine': 'med', 'nature': 'nat', 'perception': 'prc',
    'performance': 'prf', 'persuasion': 'per', 'religion': 'rel',
    'sleight of hand': 'slt', 'stealth': 'ste', 'survival': 'sur',
}

def parse_skills(text):
    """'History +5, Nature +8' -> {'his': 5, 'nat': 8}."""
    out = {}
    for item in split_commas(text):
        m = re.match(r'([A-Za-z ]+?)\s*([+-]\d+)', item)
        if m:
            name = m.group(1).strip().lower()
            key = SKILL_MAP.get(name)
            if key:
                out[key] = int(m.group(2))
    return out


# ---------------------------------------------------------------------------
# Trait / action block parsing
# ---------------------------------------------------------------------------

def parse_feature_entries(text_lines):
    """Given the lines of a section (traits, actions, reactions, legendary),
    split into individual features by the '***Name.***' / '**Name.**' pattern.
    Returns list of {name, text}."""
    # Join into paragraphs; features are separated by blank lines OR by a new
    # bold-lead. We first re-join then split on the bold-name pattern.
    joined = '\n'.join(text_lines)
    # normalise <br> to newlines so legendary actions (which use <br>) split
    joined = re.sub(r'<br\s*/?>', '\n', joined, flags=re.IGNORECASE)
    # remove HTML comments
    joined = re.sub(r'<!--.*?-->', '', joined, flags=re.DOTALL)

    feats = []
    # a feature begins with ***Name.*** or **Name.** (bold, possibly with the
    # trailing period inside or outside the bold markers)
    pattern = re.compile(r'\*\*\*?(.+?)\.?\*\*\*?\s')
    # Instead of regex-split which is fiddly, walk line by line.
    lead_re = re.compile(r'^\s*\*\*\*?(?P<name>.+?)\*\*\*?\s*(?P<rest>.*)$')

    cur_name = None
    cur_buf = []

    def flush():
        if cur_name is not None:
            body = clean_inline(' '.join(cur_buf))
            name = clean_inline(cur_name).strip(' .')
            feats.append({'name': name, 'text': body.strip()})

    for ln in joined.split('\n'):
        s = ln.strip()
        if not s:
            continue
        m = lead_re.match(s)
        # Heuristic: a new feature lead is a bold chunk that looks like a NAME
        # (short-ish, ends with a period, followed by descriptive text). We
        # treat any line starting with ** as a new feature.
        if m and s.startswith('**'):
            flush()
            name = m.group('name').strip()
            # the name sometimes carries a trailing period inside the bold
            rest = m.group('rest').strip()
            cur_name = name.strip(' .')
            cur_buf = [rest] if rest else []
        else:
            if cur_name is None:
                # text before any bold lead -> a preamble "feature"
                cur_name = ''
                cur_buf = [s]
            else:
                cur_buf.append(s)
    flush()
    # drop empty preamble if it has no text
    feats = [f for f in feats if f['name'] or f['text']]
    return feats


# ---------------------------------------------------------------------------
# Whole-statblock parser
# ---------------------------------------------------------------------------

FIELD_LABELS = [
    'Armor Class', 'Hit Points', 'Speed', 'Saving Throws', 'Skills',
    'Damage Vulnerabilities', 'Damage Resistances', 'Damage Immunities',
    'Damage Resistance', 'Condition Immunities', 'Senses', 'Languages',
    'Challenge',
]

def parse_statblock(block_lines):
    # strip blockquote markers
    lines = [strip_bq(l) for l in block_lines]

    mon = {
        'name': '', 'size': '', 'type': '', 'subtype': '', 'alignment': '',
        'ac': 10, 'ac_note': '', 'hp': 1, 'hp_formula': '',
        'speed': {}, 'abilities': {}, 'saves': {}, 'skills': {},
        'damage_vulnerabilities': '', 'damage_resistances': '',
        'damage_immunities': '', 'condition_immunities': '',
        'senses': {}, 'languages': '', 'cr': 0.0,
        'traits': [], 'actions': [], 'reactions': [], 'legendary': [],
    }

    # --- find name and type line ---
    name_idx = None
    for i, l in enumerate(lines):
        m = re.match(r'^\s*##\s+(.+?)\s*$', l)
        if m:
            mon['name'] = clean_inline(m.group(1)).strip()
            name_idx = i
            break
    if name_idx is None:
        return None

    # type/alignment: the next non-empty, non-hr line that is italic
    for l in lines[name_idx + 1:name_idx + 4]:
        s = l.strip()
        if not s or s.startswith('_') or s.startswith('-'):
            continue
        if s.startswith('*'):
            size, ctype, subtype, align = parse_type_line(s)
            mon['size'] = size
            mon['type'] = ctype
            mon['subtype'] = subtype
            mon['alignment'] = align
            break

    # --- scalar fields ---
    ability_cells = None
    # index sections
    section = 'header'   # header -> traits -> actions -> reactions -> legendary
    section_lines = {'traits': [], 'actions': [], 'reactions': [], 'legendary': []}

    i = name_idx + 1
    n = len(lines)
    seen_challenge = False
    while i < n:
        l = lines[i]
        s = l.strip()

        # section headers
        hm = re.match(r'^\s*###\s+(.+?)\s*$', l)
        if hm:
            h = hm.group(1).strip().lower()
            if 'legendary' in h:
                section = 'legendary'
            elif 'reaction' in h:
                section = 'reactions'
            elif 'action' in h:
                section = 'actions'
            i += 1
            continue

        # ability table data row -- format-agnostic. The score row is any line
        # (pipe-delimited or not) carrying six "NN (+/-M)" tokens. This handles
        # both  |21 (+5)|8 (-1)|...  and  15 (+2)|13 (+1)|...  (no leading pipe).
        if ability_cells is None:
            score_tokens = re.findall(r'\d+\s*\([+-]?\d+\)', s)
            if len(score_tokens) >= 6:
                ability_cells = score_tokens[:6]
                i += 1
                continue
        # skip ability header/divider rows (|:---:| or STR | DEX | ...)
        if s.startswith('|') or re.match(r'^\s*STR\s*\|', s, re.IGNORECASE):
            i += 1
            continue

        # labeled fields:  - **Label** value
        fm = re.match(r'^\s*-?\s*\*\*(.+?)\*\*\s*(.*)$', l)
        if fm and section in ('header',):
            label = fm.group(1).strip()
            value = fm.group(2).strip()
            lab = label.lower()
            if lab == 'armor class':
                mon['ac'], mon['ac_note'] = parse_ac(value)
            elif lab == 'hit points':
                mon['hp'], mon['hp_formula'] = parse_hp(value)
            elif lab == 'speed':
                mon['speed'] = parse_speed(value)
            elif lab == 'saving throws':
                mon['saves'] = parse_saves(value)
            elif lab == 'skills':
                mon['skills'] = parse_skills(value)
            elif lab == 'damage vulnerabilities':
                mon['damage_vulnerabilities'] = clean_inline(value)
            elif lab in ('damage resistances', 'damage resistance'):
                mon['damage_resistances'] = clean_inline(value)
            elif lab == 'damage immunities':
                mon['damage_immunities'] = clean_inline(value)
            elif lab == 'condition immunities':
                mon['condition_immunities'] = clean_inline(value)
            elif lab == 'senses':
                mon['senses'] = parse_senses(value)
            elif lab == 'languages':
                mon['languages'] = clean_inline(value)
            elif lab == 'challenge':
                mon['cr'] = parse_cr(value)
                seen_challenge = True
                section = 'traits'   # everything after Challenge is features
            i += 1
            continue

        # horizontal rules / dividers
        if re.match(r'^_+$', s) or re.match(r'^-{3,}$', s):
            i += 1
            continue

        # once we're past the header, accumulate feature text by section
        if seen_challenge and section in section_lines:
            section_lines[section].append(l)
        i += 1

    if ability_cells:
        mon['abilities'] = parse_abilities(ability_cells)
    else:
        mon['abilities'] = {k: 10 for k in ABILITY_KEYS}

    mon['traits'] = parse_feature_entries(section_lines['traits'])
    mon['actions'] = parse_feature_entries(section_lines['actions'])
    mon['reactions'] = parse_feature_entries(section_lines['reactions'])
    mon['legendary'] = parse_feature_entries(section_lines['legendary'])

    return mon


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_source_files(paths):
    """Parse one or more source files; return a flat list of monster dicts,
    each tagged with the basename of the file it came from."""
    monsters = []
    for src in paths:
        with open(src, encoding='utf-8') as f:
            text = f.read()
        # Normalise unicode en-dash / minus-sign to ASCII hyphen so negative
        # modifiers ("6 (–2)"), HP formulas ("1d4 – 1"), etc. parse. Em-dash
        # (—) is left alone as it is used as punctuation / "none".
        text = text.replace('–', '-').replace('−', '-')
        lines = text.split('\n')
        for block in extract_statblocks(lines):
            mon = parse_statblock(block)
            if mon and mon['name']:
                mon['source_file'] = os.path.basename(src)
                monsters.append(mon)
    return monsters


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    conv = os.path.join(os.path.dirname(repo), 'Warcraft-5e-Conversion')
    inter = os.path.join(repo, 'intermediate')
    os.makedirs(inter, exist_ok=True)

    # --- Main File (finished, canonical bestiary) ---
    main_file = os.path.join(conv, 'Manual of Monsters, Main File.txt')
    main_monsters = parse_source_files([main_file])
    with open(os.path.join(inter, 'monsters.json'), 'w', encoding='utf-8') as f:
        json.dump(main_monsters, f, indent=2, ensure_ascii=False)
    print(f'Main File: parsed {len(main_monsters)} monsters -> monsters.json')

    # --- WIP Manual of Monsters (draft/next-edition content) ---
    wip_dir = os.path.join(conv, 'WIP Manual of Monsters')
    skip = {'README.md'}
    wip_files = sorted(
        os.path.join(wip_dir, fn) for fn in os.listdir(wip_dir)
        if os.path.isfile(os.path.join(wip_dir, fn)) and fn not in skip)
    wip_monsters = parse_source_files(wip_files)
    with open(os.path.join(inter, 'monsters_wip.json'), 'w', encoding='utf-8') as f:
        json.dump(wip_monsters, f, indent=2, ensure_ascii=False)
    print(f'WIP: parsed {len(wip_monsters)} monsters -> monsters_wip.json')


if __name__ == '__main__':
    main()
