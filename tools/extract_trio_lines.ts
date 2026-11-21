// Rebuilds the offline copy of the game's lines (src/data/trio/lines.json) from a local checkout of the game.
// The app normally reads the scripts live from GitHub; this copy is only the fallback.
//   npx tsx tools/extract_trio_lines.ts /path/to/Trio-Adventures
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractLines, FILES } from "../src/trio/extract";

const game = process.argv[2] || "../Trio-Adventures";
const sources: Record<string, string> = {};
for (const [f] of FILES) {
  const p = path.join(game, "godot", "scripts", f);
  if (fs.existsSync(p)) sources[f] = fs.readFileSync(p, "utf8");
}
const lines = extractLines(sources);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "trio", "lines.json");
fs.writeFileSync(out, JSON.stringify(lines, null, 1));
const by: Record<string, number> = {};
lines.forEach((l) => { by[l.who] = (by[l.who] || 0) + 1; });
console.log(`${lines.length} lines → ${out}`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
console.log("named:", [...new Set(lines.filter((l) => l.name).map((l) => l.name))].join(", "));
