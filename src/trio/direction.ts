// Turns a character's settings + a line's direction into the acting instructions sent to Gemini.
import { INTENSITY_LABELS, type CastMember, type Pace, type Variant } from "../data/trio/cast";
import type { LineDirection } from "./store";

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

export function performanceText(l: TrioLine, d: LineDirection) {
  return (d.performance && d.performance.trim()) || l.line;
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
    `Say the line exactly as written, slang and misspellings included.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function slug(s: string, max = 40) {
  return s.toLowerCase().replace(/\*[^*]*\*/g, " ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max).replace(/_+$/, "") || "line";
}
