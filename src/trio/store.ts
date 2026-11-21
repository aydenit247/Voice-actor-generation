// Saving for the Trio studio. Audio takes go in IndexedDB (too big for localStorage);
// directions, cast edits and picked takes go in localStorage and can be exported as one settings file.
import type { CastMember, Pace, Variant } from "../data/trio/cast";

export interface LineDirection {
  emotion?: string;        // e.g. "angry", or anything typed
  intensity?: number;      // 1..5, empty = use the character's default
  pace?: Pace;             // empty = character default
  note?: string;           // director's note, free text
  performance?: string;    // performance text (game text + inline cues); empty = the game line as written
  approved?: boolean;      // marked as final
  chosenTake?: string;     // id of the take to export
  variant?: string;        // which voice variant (e.g. which goblin voice); empty = automatic
  lineText?: string;       // the line's text when last edited (so directions for removed/reworded lines can be shown)
  carriedFrom?: string;    // text of the old version this direction was carried over from
}

export interface Take {
  id: string;
  lineId: string;
  n: number;
  audioBase64: string;     // WAV
  durationSec: number;
  voice: string;
  model: string;
  prompt: string;          // the full direction sent to Gemini
  text: string;            // the exact text performed
  createdAt: number;
}

export interface Settings {
  version: 1;
  cast: Record<string, Partial<CastMember>>;   // only the changed fields
  variants: Record<string, Partial<Variant>>;  // "who:variantId" → changed fields
  lines: Record<string, LineDirection>;
  model: string;
  globalNote: string;                          // unused since the house style (kept for old settings files)
  houseStyle?: string;                         // style note for every line; undefined = HOUSE_STYLE default
}

const LS_KEY = "trio-voice-studio";
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (s && s.version === 1) return { cast: {}, variants: {}, lines: {}, model: "gemini-3.8-flash-tts", globalNote: "", ...s };
  } catch { /* storage blocked or bad JSON */ }
  return { version: 1, cast: {}, variants: {}, lines: {}, model: "gemini-3.8-flash-tts", globalNote: "" };
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* full or blocked */ }
}

// ---------- IndexedDB for takes ----------
const DB = "trio-voice-takes";
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore("takes", { keyPath: "id" });
        s.createIndex("lineId", "lineId");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction("takes", mode);
    const req = fn(t.objectStore("takes"));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
export const putTake = (t: Take) => tx("readwrite", (s) => s.put(t));
export const deleteTake = (id: string) => tx("readwrite", (s) => s.delete(id));
export const allTakes = () => tx<Take[]>("readonly", (s) => s.getAll() as IDBRequest<Take[]>);
export const clearTakes = () => tx("readwrite", (s) => s.clear());
