#!/usr/bin/env python3
"""Pull every spoken line out of the Trio Adventures Godot scripts into src/data/trio/lines.json.

Usage:  python3 tools/extract_trio_lines.py /path/to/Trio-Adventures
Re-run it whenever the game's dialogue changes, then commit the new lines.json.
Lines are keyed the same way the game matches recordings (lowercase, letters+digits only), so
generated files drop straight into godot/scripts/voice_lines.gd.
"""
import json, re, sys, pathlib

game = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '../Trio-Adventures')
scripts = game / 'godot' / 'scripts'
out = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'data' / 'trio' / 'lines.json'

# Which file is which part of the story (in play order)
FILES = [
    ('camp_script.gd', 'Scene 1 · Camp'),
    ('village_script.gd', 'Scene 2 · Goblin Village'),
    ('village_rooms_script.gd', 'Village · Buildings & Quests'),
    ('village_buildings.gd', 'Village · Buildings & Quests'),
    ('mart_script.gd', 'Scene 3 · Metocy Mart'),
    ('mart.gd', 'Scene 3 · Metocy Mart'),
    ('pass_script.gd', 'Scene 4 · The Pass'),
    ('pass.gd', 'Scene 4 · The Pass'),
    ('village.gd', 'Scene 2 · Goblin Village'),
    ('level.gd', 'Misc'),
]
STR = r'"((?:[^"\\]|\\.)*)"'

def unescape(s):
    return s.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in s else s

def key(line):
    return re.sub(r'[^a-z0-9]', '', line.lower())

def recorded_keys():
    vl = scripts / 'voice_lines.gd'
    if not vl.exists():
        return {}
    keys = {}
    for m in re.finditer(STR + r'\s*:\s*' + STR, vl.read_text()):
        keys[key(unescape(m.group(1)))] = m.group(2)
    return keys

def dicts_with_line(src):
    """Yield (dict_text, start_index) for every {...} literal that contains a "line" key."""
    for m in re.finditer(r'"line"\s*:', src):
        # walk back to the opening brace of this dict
        depth, i = 0, m.start()
        while i > 0:
            i -= 1
            c = src[i]
            if c == '}': depth += 1
            elif c == '{':
                if depth == 0: break
                depth -= 1
        # walk forward to the matching close brace, skipping strings
        j, depth, in_str = i, 0, False
        while j < len(src):
            c = src[j]
            if in_str:
                if c == '\\': j += 1
                elif c == '"': in_str = False
            elif c == '"': in_str = True
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        yield src[i:j + 1], i, j

def field(d, name):
    m = re.search(r'"' + name + r'"\s*:\s*' + STR, d)
    return unescape(m.group(1)) if m else None

def main():
    rec = recorded_keys()
    seen, lines = {}, []
    for fname, scene in FILES:
        p = scripts / fname
        if not p.exists():
            continue
        src = p.read_text()
        prev = None
        for d, i, j in dicts_with_line(src):
            line = field(d, 'line')
            who = field(d, 'who') or 'narrator'
            if not line or not line.strip():
                continue
            # comment tag on the same source line (# Ebain / # DRAFT)
            eol = src.find('\n', j)
            tail = src[j:eol if eol >= 0 else None]
            tag = 'Ebain' if '# Ebain' in tail else 'DRAFT' if '# DRAFT' in tail else ''
            k = key(line)
            if not k:
                continue
            if k in seen:
                seen[k]['uses'] += 1
                prev = {'who': who, 'line': line}
                continue
            entry = {
                'id': k[:60] + '_' + format(abs(hash(k)) % 0xFFFF, '04x') if len(k) > 60 else k,
                'key': k,
                'who': who,
                'name': field(d, 'name'),
                'mood': field(d, 'mood'),
                'thought': bool(re.search(r'"thought"\s*:\s*true', d)),
                'line': line,
                'scene': scene,
                'file': fname,
                'srcLine': src.count('\n', 0, i) + 1,
                'tag': tag,
                'recorded': rec.get(k),
                'prev': prev,
                'uses': 1,
            }
            seen[k] = entry
            lines.append(entry)
            prev = {'who': who, 'line': line}
    # stable ids (python hash() is randomized) — use a short deterministic checksum instead
    import zlib
    for e in lines:
        if len(e['key']) > 60:
            e['id'] = e['key'][:60] + '_' + format(zlib.crc32(e['key'].encode()) & 0xFFFF, '04x')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(lines, ensure_ascii=False, indent=1))
    by = {}
    for e in lines:
        by[e['who']] = by.get(e['who'], 0) + 1
    print(f'{len(lines)} unique lines → {out}')
    print(' '.join(f'{k}:{v}' for k, v in sorted(by.items(), key=lambda x: -x[1])))
    print('already recorded:', sum(1 for e in lines if e['recorded']))

main()
