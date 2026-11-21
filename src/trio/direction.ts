// Turns a character's base settings + a line's direction into the acting instructions sent to Gemini.
import { INTENSITY_LABELS, type CastMember } from "../data/trio/cast";
import type { LineDirection } from "./store";

export interface TrioLine {
  id: string; key: string; who: string; name: string | null; mood: string | null; thought: boolean;
  line: string; scene: string; file: string; srcLine: number; tag: string; recorded: string | null;
  prev: { who: string; line: string } | null; uses: number;
}

export function performanceText(l: TrioLine, d: LineDirection) {
  return (d.performance && d.performance.trim()) || l.line;
}

export function buildDirection(l: TrioLine, c: CastMember, d: LineDirection, globalNote: string, castNames: Record<string, string>) {
  const intensity = d.intensity || c.intensity;
  const pace = d.pace || c.pace;
  const emotion = (d.emotion && d.emotion.trim()) || (l.mood ? l.mood : "");
  const parts = [
    `You are voice acting in a goofy, comedic fantasy RPG (Baldur's Gate 3 meets dumb internet humor).`,
    `Character: ${l.name || c.name}. ${c.direction}`,
    c.accent ? `Accent: ${c.accent}.` : "",
    emotion ? `Emotion for this line: ${emotion}.` : "",
    `Energy: ${INTENSITY_LABELS[intensity]} (${intensity}/5). Pace: ${pace}.`,
    l.thought ? `This is an inner thought, not said out loud: quiet, close to the mic, under the breath.` : "",
    l.prev ? `Context: this comes right after ${castNames[l.prev.who] || l.prev.who} says: "${l.prev.line}"` : "",
    `Scene: ${l.scene}.`,
    d.note && d.note.trim() ? `Director's note: ${end(d.note)}` : "",
    globalNote.trim() ? `General note: ${end(globalNote)}` : "",
    `Say the line exactly as written, slang and misspellings included. Text in *asterisks* like *gasp* or *hic* is a sound to perform, not words to read.`,
  ];
  return parts.filter(Boolean).join(" ");
}

const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".");

export function slug(s: string, max = 40) {
  return s.toLowerCase().replace(/\*[^*]*\*/g, " ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max).replace(/_+$/, "") || "line";
}
