// Turns a character's settings + a line's direction into the acting instructions sent to Gemini.
import { INTENSITY_LABELS, type CastMember, type Pace, type Pronunciation, type Variant } from "../data/trio/cast";
import type { LineDirection, TakeSource } from "./store";
import { SCENE_SPACE, type Fx, type SpaceId } from "./fx";

export interface TrioLine {
  id: string; key: string; who: string; name: string | null; mood: string | null; thought: boolean;
  line: string; scene: string; file: string; srcLine: number; tag: string; recorded: string | null;
  prev: { who: string; line: string } | null; uses: number;
}

export interface Voicing {
  voice: string; direction: string; accent?: string; intensity: number; pace: Pace; variant?: Variant;
}

// Which voice a line uses: the line's own pick, else its named speaker's assigned variant, else the character default
export function variantFor(l: TrioLine, c: CastMember, d: LineDirection): Variant | undefined {
  if (!c.variants?.length) return undefined;
  const id = d.variant || (l.name && c.nameVariant?.[l.name]) || c.variants[0].id;
  return c.variants.find((v) => v.id === id) || c.variants[0];
}

export function voicing(l: TrioLine, c: CastMember, d: LineDirection): Voicing {
  const v = variantFor(l, c, d);
  return {
    voice: v?.voice || c.voice,
    direction: v?.direction || c.direction,
    accent: v ? v.accent : c.accent,
    intensity: v?.intensity || c.intensity,
    pace: v?.pace || c.pace,
    variant: v,
  };
}

// What the line says before pronunciation fixes: the line's own edited text, or the game line
export function performanceText(l: TrioLine, d: LineDirection) {
  return (d.performance && d.performance.trim()) || l.line;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Swap words for their respellings (whole words, any capitalization; ALL-CAPS words stay loud)
export function applyPronunciations(text: string, list: Pronunciation[]) {
  let out = text;
  for (const p of list) {
    if (!p.word.trim() || !p.say.trim() || p.word === p.say) continue;
    const re = new RegExp(`(^|[^A-Za-z0-9'])(${esc(p.word.trim())})(?![A-Za-z0-9])`, "gi");
    out = out.replace(re, (_, pre: string, w: string) =>
      pre + (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && p.word !== p.word.toUpperCase() ? p.say.toUpperCase()
        : /^[A-Z]/.test(w) && !/^[A-Z]/.test(p.word) ? p.say[0].toUpperCase() + p.say.slice(1) : p.say));
  }
  return out;
}
export function pronunciationsIn(text: string, list: Pronunciation[]) {
  return list.filter((p) => p.word.trim() && new RegExp(`(^|[^A-Za-z0-9'])${esc(p.word.trim())}(?![A-Za-z0-9])`, "i").test(text));
}
// The exact text sent to the voice
export function spokenText(l: TrioLine, d: LineDirection, list: Pronunciation[]) {
  return applyPronunciations(performanceText(l, d), list);
}

const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".");

export function buildDirection(l: TrioLine, c: CastMember, d: LineDirection, houseStyle: string, castNames: Record<string, string>) {
  const vo = voicing(l, c, d);
  const intensity = d.intensity || vo.intensity;
  const pace = d.pace || vo.pace;
  const emotion = (d.emotion && d.emotion.trim()) || (l.mood ? l.mood : "");
  const speaker = l.name ? `${l.name}, a ${c.name.toLowerCase().replace(/s$/, "")}` : c.name;
  const parts = [
    `You are voice acting in a goofy, comedic fantasy RPG (Baldur's Gate 3 meets dumb internet humor).`,
    `Character: ${speaker}. ${end(vo.direction)}`,
    vo.accent ? `Accent: ${vo.accent}.` : "",
    emotion ? `Emotion for this line: ${emotion}.` : "",
    `Energy: ${INTENSITY_LABELS[intensity]} (${intensity}/5). Pace: ${pace}.`,
    l.thought ? `This is an inner thought (the game adds an echo), so use a normal speaking voice unless the emotion says otherwise.` : "",
    l.prev ? `Context: this comes right after ${castNames[l.prev.who] || l.prev.who} says: "${l.prev.line}"` : "",
    `Scene: ${l.scene}.`,
    d.note && d.note.trim() ? `Director's note: ${end(d.note)}` : "",
    houseStyle.trim() ? end(houseStyle) : "",
    `Say the line exactly as written, slang and misspellings included. Some words are spelled out phonetically on purpose: say them exactly as spelled.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function slug(s: string, max = 40) {
  return s.toLowerCase().replace(/\*[^*]*\*/g, " ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max).replace(/_+$/, "") || "line";
}

// Effects for a line: the line's own pick, else the character's, else the space where the scene happens
export function fxFor(l: TrioLine, c: CastMember, d: LineDirection, takeSource?: TakeSource): Fx {
  const space = (d.fxSpace || c.fx?.space || (l.thought ? "thought" : SCENE_SPACE[l.scene]) || "dry") as SpaceId;
  return {
    pitch: d.fxPitch ?? c.fx?.pitch ?? 0,
    monster: d.fxMonster ?? c.fx?.monster ?? 0,
    space,
    speed: d.fxSpeed ?? c.fx?.speed ?? 1,
    formant: d.fxFormant ?? c.fx?.formant ?? 0,
    tone: d.fxTone ?? c.fx?.tone ?? 0,
    grit: d.fxGrit ?? c.fx?.grit ?? 0,
    tremor: d.fxTremor ?? c.fx?.tremor ?? 0,
    cleanup: d.fxCleanup ?? c.fx?.cleanup ?? (takeSource === "mic"),
  };
}
export function autoSpace(l: TrioLine, c: CastMember): SpaceId {
  return (c.fx?.space || (l.thought ? "thought" : SCENE_SPACE[l.scene]) || "dry") as SpaceId;
}
