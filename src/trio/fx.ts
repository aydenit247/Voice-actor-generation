// Voice effects, applied after Gemini generates a take: clean-up (trim silence, even loudness), pitch shift,
// "monster" layering (deeper copy + grit), and spaces (rooms, caves, echoes, muffled). The original take is never
// changed; effects are rendered for playback and export, so they can be tweaked without regenerating.

export type SpaceId =
  | "dry" | "outdoors" | "room" | "shop" | "tavern" | "hall" | "cave" | "mountain" | "thought" | "magic" | "wall" | "radio";

export interface Fx { pitch: number; monster: number; space: SpaceId; speed: number }

export const SPACES: { id: SpaceId; label: string }[] = [
  { id: "dry", label: "Studio (no echo)" },
  { id: "outdoors", label: "Outdoors (open air)" },
  { id: "room", label: "Small room" },
  { id: "shop", label: "Shop" },
  { id: "tavern", label: "Tavern / hut" },
  { id: "hall", label: "Big hall / throne room" },
  { id: "cave", label: "Cave" },
  { id: "mountain", label: "Mountain pass (echo)" },
  { id: "thought", label: "Inner thought (echo)" },
  { id: "magic", label: "Magical echo" },
  { id: "wall", label: "Through a wall (muffled)" },
  { id: "radio", label: "Old radio / phone" },
];

// Where each part of the story happens (used when a line's space is "automatic")
export const SCENE_SPACE: Record<string, SpaceId> = {
  "Scene 1 · Camp": "outdoors",
  "Scene 2 · Goblin Village": "outdoors",
  "Village · Buildings & Quests": "tavern",
  "Scene 3 · Metocy Mart": "shop",
  "Scene 4 · The Pass": "mountain",
  "Combat · Banter": "dry",
};

export const fxKey = (f: Fx) => `${f.pitch}|${f.monster}|${f.space}|${f.speed}`;

// ---------------- sample-level helpers ----------------
function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// Time-stretch without changing pitch (WSOLA: overlapping windows, each lined up with the waveform)
function timeStretch(x: Float32Array, factor: number, sr: number): Float32Array {
  const N = 1 << Math.round(Math.log2(sr * 0.04));     // ~40 ms frames
  const Hs = N / 2, Ha = Hs / factor, tol = Math.floor(N / 4);
  const outLen = Math.ceil(x.length * factor);
  const out = new Float32Array(outLen + N), norm = new Float32Array(outLen + N);
  const win = hann(N);
  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    const nominal = Math.round(k * Ha);
    let pos = nominal;
    if (k > 0) {
      const target = prev + Hs;                          // what would naturally follow the last frame
      let best = -Infinity;
      const lo = Math.max(0, nominal - tol), hi = Math.min(x.length - N, nominal + tol);
      for (let c = lo; c <= hi; c += 2) {
        let corr = 0;
        for (let i = 0; i < N; i += 4) { const a = x[c + i], b = x[target + i]; if (b !== undefined && a !== undefined) corr += a * b; }
        if (corr > best) { best = corr; pos = c; }
      }
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      const v = x[pos + i];
      if (v === undefined) break;
      out[o + i] += v * win[i];
      norm[o + i] += win[i];
    }
    prev = pos;
  }
  for (let i = 0; i < out.length; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out.subarray(0, outLen);
}

// Pitch shift that keeps the timing: stretch, then play it back faster/slower to the original length
export function pitchShift(x: Float32Array, semitones: number, sr: number): Float32Array {
  if (!semitones) return x;
  const r = Math.pow(2, semitones / 12);
  const st = timeStretch(x, r, sr);
  const y = new Float32Array(x.length);
  for (let i = 0; i < y.length; i++) {
    const p = i * r, i0 = Math.floor(p), f = p - i0;
    y[i] = i0 + 1 < st.length ? st[i0] * (1 - f) + st[i0 + 1] * f : 0;
  }
  return y;
}

// Cut silence at the start and end, then even out loudness so every line plays at the same level
function cleanUp(x: Float32Array, sr: number): Float32Array {
  const thr = 0.012, pad = Math.round(sr * 0.06);
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  const y = x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad));
  let sum = 0, peak = 0;
  for (const v of y) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
  const rms = Math.sqrt(sum / Math.max(1, y.length));
  if (rms < 1e-5) return y;
  const gain = Math.min(0.13 / rms, 0.95 / Math.max(peak, 1e-5));   // ≈ -18 dBFS average, never clipping
  for (let i = 0; i < y.length; i++) y[i] *= gain;
  return y;
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number, highCut: number, preDelay = 0) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds)), pre = Math.floor(sr * preDelay);
  const buf = ctx.createBuffer(2, len + pre, sr);
  const alpha = (1 / sr) / (1 / (2 * Math.PI * highCut) + 1 / sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last += alpha * ((Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) - last);
      d[i + pre] = last;
    }
  }
  return buf;
}

function distortionCurve(amount: number) {
  const k = amount * 60, n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

// ---------------- render ----------------
const SPACE_TAIL: Record<SpaceId, number> = {
  dry: 0, outdoors: 0.4, room: 0.6, shop: 0.8, tavern: 1.0, hall: 2.2, cave: 3, mountain: 2.2, thought: 1.6, magic: 2.6, wall: 0.5, radio: 0.2,
};

export async function renderFx(wav: ArrayBuffer, fx: Fx): Promise<AudioBuffer> {
  const tmp = new OfflineAudioContext(1, 1, 24000);
  const src = await tmp.decodeAudioData(wav.slice(0));
  const sr = src.sampleRate;
  let dry = cleanUp(src.getChannelData(0).slice(), sr);
  if (fx.speed && Math.abs(fx.speed - 1) > 0.01) dry = timeStretch(dry, 1 / fx.speed, sr);
  dry = pitchShift(dry, fx.pitch, sr);
  const tail = SPACE_TAIL[fx.space] || 0;
  const len = dry.length + Math.ceil(sr * tail);
  const ctx = new OfflineAudioContext(1, len, sr);

  const mk = (data: Float32Array) => { const b = ctx.createBuffer(1, data.length, sr); b.copyToChannel(data as Float32Array<ArrayBuffer>, 0); return b; };
  const voice = ctx.createGain();
  let pre: AudioNode = voice;

  // main voice (+ grit when monstrous)
  const main = ctx.createBufferSource(); main.buffer = mk(dry);
  if (fx.monster > 0) {
    const shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(fx.monster * 0.35); shaper.oversample = "2x";
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000 - fx.monster * 3500;
    main.connect(shaper).connect(lp).connect(voice);
    // a copy an octave down underneath, and a fifth down for extra beast
    const sub = ctx.createBufferSource(); sub.buffer = mk(pitchShift(dry, -12, sr));
    const subGain = ctx.createGain(); subGain.gain.value = fx.monster * 0.9;
    const subLp = ctx.createBiquadFilter(); subLp.type = "lowpass"; subLp.frequency.value = 2200;
    sub.connect(subLp).connect(subGain).connect(voice);
    sub.start();
    if (fx.monster > 0.5) {
      const fifth = ctx.createBufferSource(); fifth.buffer = mk(pitchShift(dry, -7, sr));
      const fg = ctx.createGain(); fg.gain.value = (fx.monster - 0.5) * 0.8;
      fifth.connect(fg).connect(voice);
      fifth.start();
    }
    const boost = ctx.createBiquadFilter(); boost.type = "lowshelf"; boost.frequency.value = 180; boost.gain.value = fx.monster * 6;
    voice.gain.value = 1 / (1 + fx.monster * 0.8);
    main.start();
    pre = voice.connect(boost);
  } else {
    main.connect(voice); main.start();
  }

  // space
  const out = ctx.createGain(); out.connect(ctx.destination);
  const wet = (seconds: number, decay: number, cut: number, mix: number, predelay = 0) => {
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, seconds, decay, cut, predelay);
    const g = ctx.createGain(); g.gain.value = mix;
    pre.connect(conv).connect(g).connect(out);
  };
  const echo = (time: number, feedback: number, mix: number, cut = 4000) => {
    const d = ctx.createDelay(2); d.delayTime.value = time;
    const fb = ctx.createGain(); fb.gain.value = feedback;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cut;
    const g = ctx.createGain(); g.gain.value = mix;
    pre.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(g).connect(out);
  };
  const direct = (gain = 1) => { const g = ctx.createGain(); g.gain.value = gain; pre.connect(g).connect(out); };

  switch (fx.space) {
    case "dry": direct(); break;
    case "outdoors": direct(); wet(0.4, 6, 5000, 0.06, 0.02); break;
    case "room": direct(); wet(0.6, 4, 6000, 0.18); break;
    case "shop": direct(); wet(0.8, 3.5, 6000, 0.2, 0.01); break;
    case "tavern": direct(); wet(1.0, 3, 5000, 0.24, 0.015); break;
    case "hall": direct(0.9); wet(2.2, 2.5, 6000, 0.32, 0.03); break;
    case "cave": direct(0.85); wet(3.0, 2, 3500, 0.42, 0.04); echo(0.22, 0.25, 0.12, 2500); break;
    case "mountain": direct(); echo(0.34, 0.32, 0.28, 3000); wet(1.4, 3, 4000, 0.12); break;
    case "thought": direct(0.85); echo(0.16, 0.42, 0.32, 3500); wet(1.2, 3, 5000, 0.25); break;
    case "magic": direct(0.9); echo(0.24, 0.48, 0.3, 5000); wet(2.6, 2, 7000, 0.35, 0.02); break;
    case "wall": {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0.7;
      pre.connect(lp).connect(g).connect(out);
      const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 0.5, 4, 500);
      const wg = ctx.createGain(); wg.gain.value = 0.25; lp.connect(conv).connect(wg).connect(out);
      break;
    }
    case "radio": {
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
      const sh = ctx.createWaveShaper(); sh.curve = distortionCurve(0.15);
      pre.connect(hp).connect(lp).connect(sh).connect(out);
      break;
    }
  }
  const rendered = await ctx.startRendering();
  // Match loudness across every line (effects add energy), never clipping. Muffled stays quieter on purpose.
  const d = rendered.getChannelData(0);
  let peak = 0, sum = 0, n = 0;
  for (const v of d) { const a = Math.abs(v); peak = Math.max(peak, a); if (a > 0.01) { sum += v * v; n++; } }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const target = fx.space === "wall" ? 0.07 : 0.13;
  if (rms > 1e-5) { const g = Math.min(target / rms, 0.98 / Math.max(peak, 1e-5)); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return rendered;
}

export function encodeWav(b: AudioBuffer): Uint8Array {
  const d = b.getChannelData(0), sr = b.sampleRate;
  const out = new Uint8Array(44 + d.length * 2);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); v.setUint32(4, 36 + d.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 0x7fff, true);
  return out;
}
