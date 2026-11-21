// Trio Adventures Voice Studio: every line from the game, with per-character voices, per-line delivery
// controls, multiple takes, batch generation and a zip export the game can use.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Download, Loader2, Mic, Play, Settings2, Square, Star, Trash2, Wand2,
} from "lucide-react";
import linesJson from "../data/trio/lines.json";
import {
  CAST, EMOTIONS, GEMINI_VOICES, INLINE_CUES, INTENSITY_LABELS, PACES, type CastMember, type Pace,
} from "../data/trio/cast";
import {
  allTakes, clearTakes, deleteTake, loadSettings, putTake, saveSettings, type LineDirection, type Settings, type Take,
} from "./store";
import { buildDirection, performanceText, slug, type TrioLine } from "./direction";
import { b64ToBytes, download, makeZip } from "./zip";

const LINES = linesJson as TrioLine[];
const SCENES = Array.from(new Set(LINES.map((l) => l.scene)));
const PAGE = 30;
type Status = "all" | "todo" | "takes" | "approved" | "recorded";

// ---------- small audio helpers ----------
let audioCtx: AudioContext | null = null;
async function durationOf(b64: string) {
  try {
    audioCtx = audioCtx || new AudioContext();
    const buf = await audioCtx.decodeAudioData(b64ToBytes(b64).buffer.slice(0) as ArrayBuffer);
    return buf.duration;
  } catch { return 0; }
}
let player: HTMLAudioElement | null = null;
let playerUrl = "";
function playB64(b64: string, onEnd: () => void) {
  stopAudio();
  playerUrl = URL.createObjectURL(new Blob([b64ToBytes(b64)], { type: "audio/wav" }));
  player = new Audio(playerUrl);
  player.onended = onEnd;
  player.play().catch(onEnd);
}
function stopAudio() {
  if (player) { player.pause(); player = null; }
  if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = ""; }
}

export default function ScriptStudio() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [takes, setTakes] = useState<Take[]>([]);
  const [who, setWho] = useState<string>("all");
  const [scene, setScene] = useState<string>("all");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editCast, setEditCast] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { allTakes().then(setTakes).catch(() => setError("Couldn't open saved takes (browser storage blocked?)")); }, []);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { setPage(0); }, [who, scene, status, search]);

  // ---------- derived ----------
  const cast = useMemo(() => {
    const m: Record<string, CastMember> = {};
    CAST.forEach((c) => { m[c.id] = { ...c, ...(settings.cast[c.id] || {}) } as CastMember; });
    return m;
  }, [settings.cast]);
  const castNames = useMemo(() => Object.fromEntries(Object.values(cast).map((c) => [c.id, c.name])), [cast]);
  const takesBy = useMemo(() => {
    const m: Record<string, Take[]> = {};
    takes.forEach((t) => { (m[t.lineId] = m[t.lineId] || []).push(t); });
    Object.values(m).forEach((l) => l.sort((a, b) => a.n - b.n));
    return m;
  }, [takes]);
  const dirOf = useCallback((id: string): LineDirection => settings.lines[id] || {}, [settings.lines]);
  const statusOf = useCallback((l: TrioLine): Exclude<Status, "all"> => {
    if (l.recorded) return "recorded";
    if (dirOf(l.id).approved) return "approved";
    if (takesBy[l.id]?.length) return "takes";
    return "todo";
  }, [dirOf, takesBy]);

  const filtered = useMemo(() => LINES.filter((l) =>
    (who === "all" || l.who === who) &&
    (scene === "all" || l.scene === scene) &&
    (status === "all" ? true : statusOf(l) === status) &&
    (!search.trim() || l.line.toLowerCase().includes(search.toLowerCase()))), [who, scene, status, search, statusOf]);
  const pageLines = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const counts = useMemo(() => {
    const c: Record<string, { total: number; done: number }> = {};
    LINES.forEach((l) => {
      const x = (c[l.who] = c[l.who] || { total: 0, done: 0 });
      x.total += 1;
      const s = statusOf(l);
      if (s === "approved" || s === "recorded") x.done += 1;
    });
    return c;
  }, [statusOf]);
  const approvedCount = LINES.filter((l) => statusOf(l) === "approved").length;
  const withTakes = LINES.filter((l) => takesBy[l.id]?.length).length;

  // ---------- settings updates ----------
  const setLine = (id: string, patch: Partial<LineDirection>) =>
    setSettings((s) => ({ ...s, lines: { ...s.lines, [id]: { ...(s.lines[id] || {}), ...patch } } }));
  const setCastField = (id: string, patch: Partial<CastMember>) =>
    setSettings((s) => ({ ...s, cast: { ...s.cast, [id]: { ...(s.cast[id] || {}), ...patch } } }));

  // ---------- generation ----------
  const generate = useCallback(async (l: TrioLine): Promise<"ok" | "rate" | "fatal"> => {
    const c = cast[l.who] || cast.narrator;
    const d = settings.lines[l.id] || {};
    const prompt = buildDirection(l, c, d, settings.globalNote, castNames);
    const text = performanceText(l, d);
    setBusy((b) => ({ ...b, [l.id]: true }));
    try {
      const r = await fetch("/api/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: text, style: prompt, voiceName: c.voice, model: settings.model }),
      });
      const p = await r.json().catch(() => ({}));
      if (!r.ok || !p.audioBase64) {
        setError(p.error || `Generation failed (${r.status}).`);
        return r.status === 429 ? "rate" : r.status === 403 ? "fatal" : "ok";
      }
      const existing = takesBy[l.id] || [];
      const take: Take = {
        id: `${l.id}-${Date.now()}`, lineId: l.id, n: (existing[existing.length - 1]?.n || 0) + 1,
        audioBase64: p.audioBase64, durationSec: await durationOf(p.audioBase64), voice: c.voice, model: settings.model,
        prompt, text, createdAt: Date.now(),
      };
      await putTake(take);
      setTakes((t) => [...t, take]);
      setError(null);
      return "ok";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      return "ok";
    } finally {
      setBusy((b) => ({ ...b, [l.id]: false }));
    }
  }, [cast, castNames, settings.globalNote, settings.lines, settings.model, takesBy]);

  const generateMissing = async () => {
    const todo = filtered.filter((l) => !l.recorded && !takesBy[l.id]?.length);
    if (!todo.length) { setError("Every line in this view already has a take. Use Redo on a line for another take."); return; }
    stopRef.current = false;
    setBatch({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length && !stopRef.current; i++) {
      let res = await generate(todo[i]);
      if (res === "rate" && !stopRef.current) {          // rate limited: wait and try once more
        await new Promise((r) => setTimeout(r, 20000));
        res = await generate(todo[i]);
      }
      if (res === "fatal" || res === "rate") break;
      setBatch({ done: i + 1, total: todo.length });
      await new Promise((r) => setTimeout(r, 900));
    }
    setBatch(null);
  };

  const removeTake = async (t: Take) => {
    await deleteTake(t.id);
    setTakes((all) => all.filter((x) => x.id !== t.id));
    if (dirOf(t.lineId).chosenTake === t.id) setLine(t.lineId, { chosenTake: undefined });
  };

  const play = (t: Take) => {
    if (playing === t.id) { stopAudio(); setPlaying(null); return; }
    setPlaying(t.id);
    playB64(t.audioBase64, () => setPlaying((p) => (p === t.id ? null : p)));
  };

  // ---------- export / import ----------
  const exportZip = (approvedOnly: boolean) => {
    const files: { name: string; data: Uint8Array | string }[] = [];
    const manifest: object[] = [];
    const gd: string[] = [];
    const used = new Set<string>();
    LINES.forEach((l) => {
      const list = takesBy[l.id];
      const d = dirOf(l.id);
      if (!list?.length || l.recorded || (approvedOnly && !d.approved)) return;
      const t = list.find((x) => x.id === d.chosenTake) || list[list.length - 1];
      let base = `${l.who}_${slug(l.line)}`;
      while (used.has(base)) base += "_2";
      used.add(base);
      const path = `voices/${l.who}/${base}.wav`;
      files.push({ name: path, data: b64ToBytes(t.audioBase64) });
      manifest.push({ key: l.key, line: l.line, who: l.who, file: path, voice: t.voice, take: t.n, performed: t.text, direction: t.prompt });
      gd.push(`\t${JSON.stringify(l.line)}: "${l.who}/${base}",`);
    });
    if (!files.length) { setError(approvedOnly ? "No approved lines yet. Approve takes (✓) first, or export all takes." : "No takes to export yet."); return; }
    files.push({ name: "manifest.json", data: JSON.stringify(manifest, null, 1) });
    files.push({ name: "voice_lines_snippet.gd", data: `# For godot/scripts/voice_lines.gd. Files are WAV; the game expects MP3 in res://assets/voices/<group>/ (convert first, or hand the zip to Claude).\n${gd.join("\n")}\n` });
    files.push({ name: "studio_settings.json", data: JSON.stringify(settings, null, 1) });
    download(makeZip(files), `trio-voices-${approvedOnly ? "approved" : "all"}-${new Date().toISOString().slice(0, 10)}.zip`);
  };
  const exportSettings = () => download(new Blob([JSON.stringify(settings, null, 1)], { type: "application/json" }), "trio-voice-settings.json");
  const importSettings = async (f: File) => {
    try {
      const s = JSON.parse(await f.text());
      if (s.version !== 1) throw new Error("Not a Trio voice settings file.");
      setSettings({ ...loadSettings(), ...s });
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that file."); }
  };

  // ---------- render ----------
  const speakers = CAST.filter((c) => counts[c.id]);
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-4 text-sm">
      {/* Top bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-stone-800 bg-[#0B0A09]/95 px-4 py-3 backdrop-blur">
        <div className="mr-2">
          <h1 className="text-xl font-semibold text-[#F5F2EB]">Trio Adventures · Voice Studio</h1>
          <p className="text-xs text-stone-400">
            {approvedCount} approved · {withTakes} with takes · {LINES.length} lines ({LINES.filter((l) => l.recorded).length} already recorded by Asar)
          </p>
        </div>
        <select className="rounded bg-stone-900 px-2 py-1.5 text-stone-200" value={settings.model}
          onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))} title="Gemini speech model">
          <option value="gemini-3.8-flash-tts">Flash TTS (best)</option>
          <option value="gemini-3.8-flash-lite-tts">Flash Lite TTS (faster)</option>
        </select>
        {batch ? (
          <button className="flex items-center gap-2 rounded bg-red-700 px-3 py-1.5 font-semibold text-white" onClick={() => { stopRef.current = true; }}>
            <Square size={14} /> Stop ({batch.done}/{batch.total})
          </button>
        ) : (
          <button className="flex items-center gap-2 rounded bg-[#E86F25] px-3 py-1.5 font-semibold text-black hover:bg-[#ff8a3d]" onClick={generateMissing}
            title="Generate one take for every line in the current view that doesn't have one yet">
            <Wand2 size={14} /> Generate missing ({filtered.filter((l) => !l.recorded && !takesBy[l.id]?.length).length})
          </button>
        )}
        <button className="flex items-center gap-2 rounded bg-stone-800 px-3 py-1.5 text-stone-100 hover:bg-stone-700" onClick={() => exportZip(true)}
          title="Download the chosen take of every approved line, ready for the game">
          <Download size={14} /> Export approved
        </button>
        <div className="relative">
          <button className="flex items-center gap-1 rounded bg-stone-800 px-2 py-1.5 text-stone-100 hover:bg-stone-700" onClick={() => setMenu((m) => !m)}>
            <Settings2 size={14} /> More <ChevronDown size={12} />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-30 w-64 rounded border border-stone-700 bg-stone-900 p-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
              <MenuItem onClick={() => exportZip(false)}>Export all takes (incl. unapproved)</MenuItem>
              <MenuItem onClick={exportSettings}>Save directions to a file</MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()}>Load directions from a file</MenuItem>
              <MenuItem danger onClick={async () => { if (confirm("Delete ALL generated takes? Directions are kept.")) { await clearTakes(); setTakes([]); } }}>Delete all takes</MenuItem>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importSettings(e.target.files[0])} />
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red-800 bg-red-950/60 px-3 py-2 text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button className="text-red-300 hover:text-white" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-5">
        {/* Cast panel */}
        <aside className="space-y-2">
          <h2 className="text-base font-semibold text-stone-200">Cast</h2>
          <button className={`w-full rounded px-3 py-2 text-left ${who === "all" ? "bg-[#E86F25]/20 text-[#ffb27a]" : "bg-stone-900 text-stone-300 hover:bg-stone-800"}`}
            onClick={() => setWho("all")}>Everyone <span className="float-right text-stone-500">{LINES.length}</span></button>
          {speakers.map((c0) => {
            const c = cast[c0.id];
            const n = counts[c.id];
            const open = editCast === c.id;
            return (
              <div key={c.id} className={`rounded border ${who === c.id ? "border-[#E86F25]/60" : "border-stone-800"} bg-stone-900/70`}>
                <div className="flex items-center">
                  <button className="flex-1 px-3 py-2 text-left" onClick={() => setWho(c.id)}>
                    <div className="font-semibold text-stone-100">{c.name}</div>
                    <div className="text-xs text-stone-400">{c.voice} · {n.done}/{n.total} done</div>
                    <div className="mt-1 h-1 rounded bg-stone-800"><div className="h-1 rounded bg-[#E86F25]" style={{ width: `${(100 * n.done) / n.total}%` }} /></div>
                  </button>
                  <button className="px-3 text-stone-400 hover:text-white" title="Edit voice & direction" onClick={() => setEditCast(open ? null : c.id)}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                </div>
                {open && (
                  <div className="space-y-2 border-t border-stone-800 px-3 py-3">
                    {c.note && <p className="rounded bg-amber-900/30 px-2 py-1 text-xs text-amber-200">{c.note}</p>}
                    <Label text="Voice">
                      <select className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" value={c.voice} onChange={(e) => setCastField(c.id, { voice: e.target.value })}>
                        {GEMINI_VOICES.map((v) => <option key={v.name} value={v.name}>{v.name}: {v.tone} ({v.sounds})</option>)}
                      </select>
                    </Label>
                    <Label text="How they talk (applies to every line)">
                      <textarea className="h-28 w-full rounded bg-stone-950 px-2 py-1 text-xs text-stone-200" value={c.direction}
                        onChange={(e) => setCastField(c.id, { direction: e.target.value })} />
                    </Label>
                    <Label text={`Default energy: ${INTENSITY_LABELS[c.intensity]}`}>
                      <input type="range" min={1} max={5} value={c.intensity} className="w-full accent-[#E86F25]"
                        onChange={(e) => setCastField(c.id, { intensity: Number(e.target.value) })} />
                    </Label>
                    <Label text="Default pace">
                      <select className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" value={c.pace} onChange={(e) => setCastField(c.id, { pace: e.target.value as Pace })}>
                        {PACES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </Label>
                    <Label text="Accent (optional)">
                      <input className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" placeholder="e.g. Southern, British, Brooklyn"
                        value={c.accent || ""} onChange={(e) => setCastField(c.id, { accent: e.target.value })} />
                    </Label>
                    <button className="text-xs text-stone-400 underline hover:text-white"
                      onClick={() => setSettings((s) => { const next = { ...s.cast }; delete next[c.id]; return { ...s, cast: next }; })}>
                      Reset {c.name} to defaults
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <Label text="Note for every line (optional)">
            <textarea className="h-16 w-full rounded bg-stone-900 px-2 py-1 text-xs text-stone-200" placeholder="e.g. keep it short and punchy, no long pauses"
              value={settings.globalNote} onChange={(e) => setSettings((s) => ({ ...s, globalNote: e.target.value }))} />
          </Label>
        </aside>

        {/* Lines */}
        <main>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className="rounded bg-stone-900 px-2 py-1.5 text-stone-200" value={scene} onChange={(e) => setScene(e.target.value)}>
              <option value="all">All scenes</option>
              {SCENES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="rounded bg-stone-900 px-2 py-1.5 text-stone-200" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="all">Any status</option>
              <option value="todo">Needs a take</option>
              <option value="takes">Has takes, not approved</option>
              <option value="approved">Approved</option>
              <option value="recorded">Recorded by Asar</option>
            </select>
            <input className="min-w-[220px] flex-1 rounded bg-stone-900 px-3 py-1.5 text-stone-200" placeholder="Search lines…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="text-stone-500">{filtered.length} lines</span>
          </div>

          <div className="space-y-3">
            {pageLines.map((l) => (
              <LineCard key={l.id} l={l} c={cast[l.who] || cast.narrator} d={dirOf(l.id)} takes={takesBy[l.id] || []}
                busy={!!busy[l.id]} playing={playing} castNames={castNames} globalNote={settings.globalNote}
                onChange={(p) => setLine(l.id, p)} onGenerate={() => generate(l)} onPlay={play} onDelete={removeTake} />
            ))}
            {!pageLines.length && <p className="py-10 text-center text-stone-500">No lines match.</p>}
          </div>

          {filtered.length > PAGE && (
            <div className="mt-4 flex items-center justify-center gap-3 text-stone-300">
              <button disabled={page === 0} className="rounded bg-stone-800 px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span>Page {page + 1} / {Math.ceil(filtered.length / PAGE)}</span>
              <button disabled={(page + 1) * PAGE >= filtered.length} className="rounded bg-stone-800 px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button className={`block w-full rounded px-3 py-2 text-left hover:bg-stone-800 ${danger ? "text-red-300" : "text-stone-200"}`} onClick={onClick}>{children}</button>;
}
function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-stone-400">{text}</span>{children}</label>;
}

// ---------- one line ----------
function LineCard(props: {
  l: TrioLine; c: CastMember; d: LineDirection; takes: Take[]; busy: boolean; playing: string | null;
  castNames: Record<string, string>; globalNote: string;
  onChange: (p: Partial<LineDirection>) => void; onGenerate: () => void; onPlay: (t: Take) => void; onDelete: (t: Take) => void;
}) {
  const { l, c, d, takes, busy, playing, onChange } = props;
  const [showPerf, setShowPerf] = useState(!!d.performance);
  const [showPrompt, setShowPrompt] = useState(false);
  const perfRef = useRef<HTMLTextAreaElement | null>(null);
  const chosen = takes.find((t) => t.id === d.chosenTake) || takes[takes.length - 1];

  const insertCue = (cue: string) => {
    const base = d.performance && d.performance.trim() ? d.performance : l.line;
    const el = perfRef.current;
    const at = el && el.selectionStart != null ? el.selectionStart : base.length;
    const next = base.slice(0, at) + (at > 0 && base[at - 1] !== " " ? " " : "") + cue + " " + base.slice(at);
    onChange({ performance: next.replace(/\s{2,}/g, " ") });
  };

  if (l.recorded) {
    return (
      <div className="rounded border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 opacity-80">
        <div className="mb-1 flex gap-2 text-xs"><Badge>{l.name || props.castNames[l.who] || l.who}</Badge><span className="text-emerald-300">Recorded by Asar · skipped</span></div>
        <p className="text-stone-200">{l.line}</p>
      </div>
    );
  }

  return (
    <div className={`rounded border px-4 py-3 ${d.approved ? "border-emerald-700/60 bg-emerald-950/10" : "border-stone-800 bg-stone-900/50"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-stone-400">
        <Badge>{l.name || props.castNames[l.who] || l.who}</Badge>
        <span>{l.scene}</span>
        {l.tag && <span className={l.tag === "Ebain" ? "text-[#ffb27a]" : "text-stone-500"}>{l.tag === "Ebain" ? "Ebain's line" : "Draft line"}</span>}
        {l.mood && <span>mood: {l.mood}</span>}
        {l.thought && <span className="italic">inner thought</span>}
        {l.uses > 1 && <span>used {l.uses}×</span>}
      </div>
      {l.prev && <p className="mb-1 text-xs italic text-stone-500">after {props.castNames[l.prev.who] || l.prev.who}: “{l.prev.line.length > 110 ? l.prev.line.slice(0, 110) + "…" : l.prev.line}”</p>}
      <p className="mb-3 text-base text-[#F5F2EB]">{l.line}</p>

      {/* Delivery controls */}
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-3">
        <Label text="Emotion">
          <input list="trio-emotions" className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" placeholder={l.mood || "e.g. angry, sheepish, drunk…"}
            value={d.emotion || ""} onChange={(e) => onChange({ emotion: e.target.value })} />
          <datalist id="trio-emotions">{EMOTIONS.map((e) => <option key={e} value={e} />)}</datalist>
        </Label>
        <Label text={`Energy: ${d.intensity ? INTENSITY_LABELS[d.intensity] : `default (${INTENSITY_LABELS[c.intensity]})`}`}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} title={INTENSITY_LABELS[n]} onClick={() => onChange({ intensity: d.intensity === n ? undefined : n })}
                className={`h-7 flex-1 rounded text-xs ${d.intensity === n ? "bg-[#E86F25] font-bold text-black" : n === c.intensity && !d.intensity ? "bg-stone-700 text-stone-200" : "bg-stone-950 text-stone-400 hover:bg-stone-800"}`}>{n}</button>
            ))}
          </div>
        </Label>
        <Label text="Pace">
          <select className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" value={d.pace || ""} onChange={(e) => onChange({ pace: (e.target.value || undefined) as Pace | undefined })}>
            <option value="">default ({c.pace})</option>
            {PACES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Label>
      </div>
      <div className="mt-2">
        <Label text="Director's note">
          <input className="w-full rounded bg-stone-950 px-2 py-1 text-stone-200" placeholder="e.g. like he just realized he burned the only map; voice cracks on 'dumb'"
            value={d.note || ""} onChange={(e) => onChange({ note: e.target.value })} />
        </Label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <button className="text-stone-400 underline hover:text-white" onClick={() => setShowPerf((s) => !s)}>
          {showPerf ? "Hide" : "Add pauses, laughs, breaths…"}
        </button>
        <button className="text-stone-500 underline hover:text-white" onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? "Hide" : "Show"} what gets sent
        </button>
      </div>
      {showPerf && (
        <div className="mt-2 rounded bg-stone-950/70 p-2">
          <p className="mb-1 text-xs text-stone-400">Performance text: what the voice actually reads. Cues are acted, not said. The game still matches by the original line.</p>
          <textarea ref={perfRef} className="h-16 w-full rounded bg-stone-950 px-2 py-1 text-stone-200" value={d.performance || l.line}
            onChange={(e) => onChange({ performance: e.target.value === l.line ? undefined : e.target.value })} />
          <div className="mt-1 flex flex-wrap gap-1">
            {INLINE_CUES.map((cue) => <button key={cue} className="rounded bg-stone-800 px-2 py-0.5 font-mono text-xs text-stone-300 hover:bg-stone-700" onClick={() => insertCue(cue)}>{cue}</button>)}
            {d.performance && <button className="ml-auto text-xs text-stone-400 underline" onClick={() => onChange({ performance: undefined })}>reset to game line</button>}
          </div>
        </div>
      )}
      {showPrompt && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-black/50 p-2 text-[11px] text-stone-400">
          {buildDirection(l, c, d, props.globalNote, props.castNames)}{"\n\n"}Text: {performanceText(l, d)}{"\n"}Voice: {c.voice}
        </pre>
      )}

      {/* Takes */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-800 pt-3">
        <button disabled={busy} onClick={props.onGenerate}
          className="flex items-center gap-1.5 rounded bg-[#E86F25] px-3 py-1.5 font-semibold text-black hover:bg-[#ff8a3d] disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />} {takes.length ? "New take" : "Generate"}
        </button>
        {takes.map((t) => {
          const isChosen = chosen?.id === t.id;
          return (
            <div key={t.id} className={`flex items-center gap-1 rounded px-1.5 py-1 ${isChosen ? "bg-stone-700" : "bg-stone-950"}`}>
              <button className="flex items-center gap-1 px-1 text-stone-100" onClick={() => props.onPlay(t)} title={t.prompt}>
                {playing === t.id ? <Square size={12} /> : <Play size={12} />} Take {t.n}
                <span className="text-stone-500">{t.durationSec ? `${t.durationSec.toFixed(1)}s` : ""}</span>
              </button>
              <button title="Use this take" onClick={() => onChange({ chosenTake: t.id })} className={isChosen ? "text-[#ffcf5a]" : "text-stone-600 hover:text-stone-300"}>
                <Star size={13} fill={isChosen ? "currentColor" : "none"} />
              </button>
              <button title="Delete take" onClick={() => props.onDelete(t)} className="text-stone-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          );
        })}
        {takes.length > 0 && (
          <button onClick={() => onChange({ approved: !d.approved, chosenTake: d.chosenTake || chosen?.id })}
            className={`ml-auto flex items-center gap-1 rounded px-3 py-1.5 font-semibold ${d.approved ? "bg-emerald-600 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>
            <Check size={14} /> {d.approved ? "Approved" : "Approve"}
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-[#E86F25]/20 px-2 py-0.5 font-semibold text-[#ffb27a]">{children}</span>;
}

