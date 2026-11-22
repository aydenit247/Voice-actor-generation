// Voice effects, applied after Gemini generates a take or after recording/uploading a human take:
// mic cleanup (high-pass rumble cut + soft noise gate), silence trim & loudness leveling, speed, pitch shift,
// vocal-tract voice size (formant contour), tone tilt, throat grit/gravel, voice tremor, "monster" layering,
// and acoustic spaces. The original take is never modified; effects are rendered non-destructively for playback and export.

export type SpaceId =
  | "dry" | "outdoors" | "room" | "shop" | "tavern" | "hall" | "cave" | "mountain" | "thought" | "magic" | "wall" | "radio";

export interface Fx {
  pitch: number;      // -12..+12 semitones
  monster: number;    // 0..1 deeper octave/fifth layering + grit
  space: SpaceId;
  speed: number;      // 0.6..1.6x playback rate without changing pitch
  formant?: number;   // -100 (smaller/goblin) .. +100 (larger/giant) vocal-tract shaping
  tone?: number;      // -100 (dark/warm chest) .. +100 (bright/sharp/nasal)
  grit?: number;      // 0..1 independent vocal rasp / gravel
  tremor?: number;    // 0..1 organic voice wobble / frail vibrato
  cleanup?: boolean;  // 85Hz high-pass rumble cut + soft room noise gate
}

export interface FxPreset {
  id: string;
  label: string;
  fx: Partial<Fx>;
}

export const FX_PRESETS: FxPreset[] = [
  {
    id: "clean",
    label: "Clean Studio (Reset)",
    fx: { pitch: 0, speed: 1, monster: 0, formant: 0, tone: 0, grit: 0, tremor: 0, space: "dry" },
  },
  {
    id: "orc",
    label: "Gravelly Orc",
    fx: { pitch: -2, speed: 1, monster: 0.2, formant: 40, tone: -25, grit: 0.55, tremor: 0 },
  },
  {
    id: "goblin",
    label: "Nasal Goblin",
    fx: { pitch: 3, speed: 1.08, monster: 0, formant: -60, tone: 55, grit: 0.2, tremor: 0 },
  },
  {
    id: "elf",
    label: "Smooth Elf",
    fx: { pitch: 0, speed: 1, monster: 0, formant: -8, tone: 22, grit: 0, tremor: 0 },
  },
  {
    id: "dragon",
    label: "Ancient Dragon",
    fx: { pitch: -3, speed: 0.94, monster: 0.28, formant: 50, tone: -40, grit: 0.25, tremor: 0 },
  },
  {
    id: "wizard",
    label: "Frail Wizard",
    fx: { pitch: 1, speed: 0.92, monster: 0, formant: -18, tone: 25, grit: 0.3, tremor: 0.55 },
  },
  {
    id: "demon",
    label: "Booming Demon",
    fx: { pitch: -5, speed: 0.94, monster: 0.85, formant: 65, tone: -35, grit: 0.45, tremor: 0, space: "cave" },
  },
  {
    id: "giant",
    label: "Mountain Giant",
    fx: { pitch: -4, speed: 0.88, monster: 0.55, formant: 85, tone: -50, grit: 0.2, tremor: 0, space: "mountain" },
  },
];

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
  "Scene 4 · The Pass": "dry",   // Ebain 2026-11-22: studio, no echo
  "Combat · Banter": "dry",
};

export const fxKey = (f: Fx) =>
  `${f.pitch}|${f.monster}|${f.space}|${f.speed}|${f.formant ?? 0}|${f.tone ?? 0}|${f.grit ?? 0}|${f.tremor ?? 0}|${f.cleanup ? 1 : 0}`;

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
  const outLen = Math.max(1, Math.ceil(x.length * factor));
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

// Gentle 85Hz high-pass rumble cut + soft-knee room noise gate for microphone recordings
function micCleanupPass(x: Float32Array, sr: number): Float32Array {
  const y = new Float32Array(x.length);
  // 1-pole high-pass at ~85 Hz to remove desk thumps, breath rumble, and AC hum
  const rc = 1 / (2 * Math.PI * 85);
  const dt = 1 / sr;
  const alpha = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < x.length; i++) {
    const out = alpha * (prevOut + x[i] - prevIn);
    prevIn = x[i];
    prevOut = out;
    y[i] = out;
  }
  // Estimate peak so threshold scales gracefully for quiet vs loud mics
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak < 1e-4) return y;

  // Soft noise gate with smooth 6ms attack and 95ms release
  const openThr = Math.max(0.012, peak * 0.055);
  const closeThr = openThr * 0.45;
  const floorGain = 0.14; // ~-17 dB gentle attenuation (never sounds abruptly choppy)
  const attack = Math.exp(-1 / (sr * 0.006));
  const release = Math.exp(-1 / (sr * 0.095));
  const envDecay = Math.exp(-1 / (sr * 0.02));
  let env = 0;
  let gate = floorGain;

  for (let i = 0; i < y.length; i++) {
    const a = Math.abs(y[i]);
    env = a > env ? a : env * envDecay + a * (1 - envDecay);
    const target =
      env >= openThr ? 1
        : env <= closeThr ? floorGain
          : floorGain + ((env - closeThr) / (openThr - closeThr)) * (1 - floorGain);
    gate = target > gate ? attack * gate + (1 - attack) * target : release * gate + (1 - release) * target;
    y[i] *= gate;
  }
  return y;
}

// Cut silence at the start and end, then even out loudness so every line plays at the same level
function cleanUp(x: Float32Array, sr: number, useMicCleanup?: boolean): Float32Array {
  const pre = useMicCleanup ? micCleanupPass(x, sr) : x;
  const thr = 0.012, pad = Math.round(sr * 0.06);
  let a = 0, b = pre.length - 1;
  while (a < pre.length && Math.abs(pre[a]) < thr) a++;
  while (b > a && Math.abs(pre[b]) < thr) b--;
  const y = a < b
    ? pre.slice(Math.max(0, a - pad), Math.min(pre.length, b + pad))
    : pre.slice();
  if (!y.length) return new Float32Array(Math.max(1, Math.round(sr * 0.1)));
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

// Asymmetric throat-gravel saturation curve: creates organic vocal fry / raspy harmonics without harsh fuzz
function gritCurve(amount: number) {
  const drive = 1 + amount * 14;
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    // Slight asymmetry introduces warm even harmonics typical of vocal cord rasp
    const shifted = x + 0.08 * amount;
    const raw = Math.tanh(shifted * drive) - Math.tanh(0.08 * amount * drive);
    c[i] = Math.max(-1, Math.min(1, raw * 1.05));
  }
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
  let dry = cleanUp(src.getChannelData(0).slice(), sr, fx.cleanup);
  if (fx.speed && Math.abs(fx.speed - 1) > 0.01) dry = timeStretch(dry, 1 / fx.speed, sr);
  dry = pitchShift(dry, fx.pitch, sr);

  const formant = Math.max(-100, Math.min(100, fx.formant ?? 0)) / 100;
  const tone = Math.max(-100, Math.min(100, fx.tone ?? 0)) / 100;
  const grit = Math.max(0, Math.min(1, fx.grit ?? 0));
  const tremor = Math.max(0, Math.min(1, fx.tremor ?? 0));

  const tail = SPACE_TAIL[fx.space] || 0;
  const len = dry.length + Math.ceil(sr * (tail + (tremor > 0 ? 0.05 : 0)));
  const ctx = new OfflineAudioContext(1, len, sr);

  const mk = (data: Float32Array) => { const b = ctx.createBuffer(1, data.length, sr); b.copyToChannel(data as Float32Array<ArrayBuffer>, 0); return b; };
  const voice = ctx.createGain();
  let pre: AudioNode = voice;

  // Main voice (+ monster octave/fifth layering)
  const main = ctx.createBufferSource(); main.buffer = mk(dry);
  if (fx.monster > 0) {
    const shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(fx.monster * 0.35); shaper.oversample = "2x";
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000 - fx.monster * 3500;
    main.connect(shaper).connect(lp).connect(voice);
    // A copy an octave down underneath, and a fifth down for extra beast
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

  // Voice size / formant-contour shaping (-1 = smaller/goblin vocal tract, +1 = larger/giant chest)
  if (Math.abs(formant) > 0.01) {
    const chest = ctx.createBiquadFilter();
    chest.type = "lowshelf";
    chest.frequency.value = formant > 0 ? 220 : 260;
    chest.gain.value = formant > 0 ? formant * 8.5 : formant * 10;

    const f1 = ctx.createBiquadFilter();
    f1.type = "peaking";
    f1.frequency.value = formant > 0 ? 480 : 620;
    f1.Q.value = 1.2;
    f1.gain.value = formant > 0 ? formant * 5.5 : formant * 4.5;

    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking";
    f2.frequency.value = formant > 0 ? 1850 : 1750;
    f2.Q.value = 1.4;
    f2.gain.value = formant > 0 ? -formant * 6.5 : -formant * 6.5;

    const f3 = ctx.createBiquadFilter();
    f3.type = "peaking";
    f3.frequency.value = 3050;
    f3.Q.value = 1.3;
    f3.gain.value = formant > 0 ? -formant * 5.5 : -formant * 7.5;

    pre = pre.connect(chest).connect(f1).connect(f2).connect(f3);

    if (formant > 0.15) {
      const top = ctx.createBiquadFilter();
      top.type = "lowpass";
      top.frequency.value = 7800 - formant * 3800;
      pre = pre.connect(top);
    }
  }

  // Tone / Warmth ↔ Bright-Nasal tilt
  if (Math.abs(tone) > 0.01) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 250;
    low.gain.value = -tone * 6;

    const nasal = ctx.createBiquadFilter();
    nasal.type = "peaking";
    nasal.frequency.value = 1350;
    nasal.Q.value = 1.6;
    nasal.gain.value = tone > 0 ? tone * 6 : tone * 2;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 3400;
    high.gain.value = tone > 0 ? tone * 7.5 : tone * 9.5;

    pre = pre.connect(low).connect(nasal).connect(high);
  }

  // Independent throat grit / gravel (parallel wet saturation focused on vocal core)
  if (grit > 0.01) {
    const merge = ctx.createGain();
    const dryPath = ctx.createGain();
    dryPath.gain.value = 1 - grit * 0.35;
    pre.connect(dryPath).connect(merge);

    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4400;
    const rasp = ctx.createWaveShaper(); rasp.curve = gritCurve(grit); rasp.oversample = "2x";
    const postLp = ctx.createBiquadFilter(); postLp.type = "lowpass"; postLp.frequency.value = 5200 - grit * 1400;
    const wetGain = ctx.createGain(); wetGain.gain.value = grit * 0.72;
    pre.connect(hp).connect(lp).connect(rasp).connect(postLp).connect(wetGain).connect(merge);
    pre = merge;
  }

  // Organic voice tremor / frail wobble (subtle dual-LFO pitch vibrato + amplitude flutter)
  if (tremor > 0.01) {
    const vibDelay = ctx.createDelay(0.05);
    vibDelay.delayTime.value = 0.012;
    const vibLfo = ctx.createOscillator();
    vibLfo.type = "sine";
    vibLfo.frequency.value = 6.2;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 0.0014 * tremor;
    vibLfo.connect(vibDepth).connect(vibDelay.delayTime);
    vibLfo.start();

    const ampNode = ctx.createGain();
    ampNode.gain.value = 1 - 0.14 * tremor;
    const ampLfo = ctx.createOscillator();
    ampLfo.type = "sine";
    ampLfo.frequency.value = 5.4;
    const ampDepth = ctx.createGain();
    ampDepth.gain.value = 0.24 * tremor;
    ampLfo.connect(ampDepth).connect(ampNode.gain);
    ampLfo.start();

    pre = pre.connect(vibDelay).connect(ampNode);
  }

  // Space
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
