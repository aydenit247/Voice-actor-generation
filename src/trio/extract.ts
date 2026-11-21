// Reads the game's dialogue scripts straight from GitHub (the repo is public), so the studio always has the
// current lines. Same rules as tools/extract_trio_lines.py, which makes the bundled fallback copy.
import type { TrioLine } from "./direction";

export const GAME_RAW = "https://raw.githubusercontent.com/aydenit247/Trio-Adventures/foundation/godot/scripts/";

// Which file is which part of the story (play order)
export const FILES: [string, string][] = [
  ["camp_script.gd", "Scene 1 · Camp"],
  ["village_script.gd", "Scene 2 · Goblin Village"],
  ["village_rooms_script.gd", "Village · Buildings & Quests"],
  ["village_buildings.gd", "Village · Buildings & Quests"],
  ["mart_script.gd", "Scene 3 · Metocy Mart"],
  ["mart.gd", "Scene 3 · Metocy Mart"],
  ["pass_script.gd", "Scene 4 · The Pass"],
  ["pass.gd", "Scene 4 · The Pass"],
  ["village.gd", "Scene 2 · Goblin Village"],
  ["level.gd", "Misc"],
];

export const lineKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function unescape(s: string) {
  return s.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

function crc16ish(s: string) {
  let c = 0xffffffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i);
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (((c ^ 0xffffffff) >>> 0) & 0xffff).toString(16).padStart(4, "0");
}
export const lineId = (k: string) => (k.length > 60 ? `${k.slice(0, 60)}_${crc16ish(k)}` : k);

// Every {...} dictionary literal in the source that has a "line" key
function* dictsWithLine(src: string): Generator<[string, number, number]> {
  const re = /"line"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0, i = m.index;
    while (i > 0) {
      i--;
      const c = src[i];
      if (c === "}") depth++;
      else if (c === "{") { if (depth === 0) break; depth--; }
    }
    let j = i, inStr = false;
    depth = 0;
    for (; j < src.length; j++) {
      const c = src[j];
      if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    yield [src.slice(i, j + 1), i, j];
  }
}

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
function field(d: string, name: string, consts: Record<string, string>) {
  const m = new RegExp(`"${name}"\\s*:\\s*${STR}`).exec(d);
  if (m) return unescape(m[1]);
  const c = new RegExp(`"${name}"\\s*:\\s*([A-Z_][A-Z0-9_]*)\\b`).exec(d);   // const NAME := "Value"
  return c && consts[c[1]] ? consts[c[1]] : null;
}

export function extractLines(sources: Record<string, string>): TrioLine[] {
  const seen: Record<string, TrioLine> = {};
  const out: TrioLine[] = [];
  for (const [file, scene] of FILES) {
    const src = sources[file];
    if (!src) continue;
    const consts: Record<string, string> = {};
    for (const m of src.matchAll(new RegExp(String.raw`^const\s+([A-Z_][A-Z0-9_]*)\s*:?=\s*${STR}`, "gm"))) consts[m[1]] = unescape(m[2]);
    let prev: TrioLine["prev"] = null;
    for (const [d, i, j] of dictsWithLine(src)) {
      const line = field(d, "line", consts);
      const who = field(d, "who", consts) || "narrator";
      if (!line || !line.trim()) continue;
      const k = lineKey(line);
      if (!k) continue;
      if (seen[k]) { seen[k].uses += 1; prev = { who, line }; continue; }
      const eol = src.indexOf("\n", j);
      const tail = src.slice(j, eol >= 0 ? eol : undefined);
      const e: TrioLine = {
        id: lineId(k), key: k, who, name: field(d, "name", consts), mood: field(d, "mood", consts),
        thought: /"thought"\s*:\s*true/.test(d), line, scene, file,
        srcLine: src.slice(0, i).split("\n").length,
        tag: tail.includes("# Ebain") ? "Ebain" : tail.includes("# DRAFT") ? "DRAFT" : "",
        recorded: null, prev, uses: 1,
      };
      seen[k] = e;
      out.push(e);
      prev = { who, line };
    }
  }
  return out;
}

export async function fetchGameLines(): Promise<TrioLine[]> {
  const sources: Record<string, string> = {};
  await Promise.all(FILES.map(async ([f]) => {
    const r = await fetch(GAME_RAW + f + `?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) sources[f] = await r.text();
  }));
  if (!sources["camp_script.gd"]) throw new Error("Couldn't reach the game's scripts on GitHub.");
  return extractLines(sources);
}

// How alike two lines are (0..1), for carrying a direction over when a line gets reworded
export function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const t = lineKey(s);
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const A = grams(a), B = grams(b);
  let inter = 0, total = 0;
  A.forEach((v, k) => { inter += Math.min(v, B.get(k) || 0); total += v; });
  B.forEach((v) => { total += v; });
  return total ? (2 * inter) / total : 0;
}
