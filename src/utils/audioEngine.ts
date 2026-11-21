import type { AcousticSpace } from "../types/studio";

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function extractWaveformPeaks(
  audioBuffer: AudioBuffer,
  barCount = 84
): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / barCount));
  const peaks: number[] = [];
  let maxPeak = 0.001;

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let sumSquares = 0;
    let localPeak = 0;
    for (let j = start; j < end; j++) {
      const sample = Math.abs(channelData[j]);
      if (sample > localPeak) localPeak = sample;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    const blended = localPeak * 0.65 + rms * 0.35;
    peaks.push(blended);
    if (blended > maxPeak) maxPeak = blended;
  }

  return peaks.map((p) => Math.max(0.08, Math.min(1, p / maxPeak)));
}

export function downloadWavFile(base64Audio: string, filename: string): void {
  const buffer = base64ToArrayBuffer(base64Audio);
  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".wav") ? filename : `${filename}.wav`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/**
 * Generates a realistic synthetic impulse response for Cavern Hall or Outdoor Campfire spaces.
 */
function createImpulseResponse(
  ctx: AudioContext,
  durationSec: number,
  decay: number,
  highCutHz: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lastOut = 0;
    const rc = 1 / (2 * Math.PI * highCutHz);
    const dt = 1 / sampleRate;
    const alpha = dt / (rc + dt);

    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      const white = (Math.random() * 2 - 1) * env;
      lastOut = lastOut + alpha * (white - lastOut);
      data[i] = lastOut;
    }
  }
  return impulse;
}

/**
 * Synthesizes a seamless looping campfire hearth bed (low warm rumble + crisp wood crackles).
 */
function createCampfireLoopBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 6;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const out = buffer.getChannelData(ch);
    let brown = 0;
    let crackleEnv = 0;
    let crackleFreq = 0;

    for (let i = 0; i < length; i++) {
      // Warm hearth low rumble (brown noise)
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.025 * white) / 1.025;
      const flutter = 0.72 + 0.28 * Math.sin((i / sampleRate) * 2.3 + ch * 1.4);

      // Stochastic ember crackle & pop transients
      if (Math.random() < 0.00045) {
        crackleEnv = 0.25 + Math.random() * 0.55;
        crackleFreq = 0.4 + Math.random() * 0.5;
      }
      let crackle = 0;
      if (crackleEnv > 0.001) {
        crackle = (Math.random() * 2 - 1) * crackleEnv * crackleFreq;
        crackleEnv *= 0.988;
      }

      // Smooth crossfade envelope near loop boundaries
      const fadeSamples = sampleRate * 0.25;
      let loopGain = 1;
      if (i < fadeSamples) loopGain = i / fadeSamples;
      else if (i > length - fadeSamples) loopGain = (length - i) / fadeSamples;

      out[i] = (brown * 2.2 * flutter + crackle * 0.55) * loopGain;
    }
  }

  return buffer;
}

export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private campfireSource: AudioBufferSourceNode | null = null;
  private campfireGain: GainNode | null = null;
  private campfireBuffer: AudioBuffer | null = null;
  private cavernIR: AudioBuffer | null = null;
  private outdoorIR: AudioBuffer | null = null;
  private analyser: AnalyserNode | null = null;

  private activeBuffer: AudioBuffer | null = null;
  private isPlaying = false;
  private startedAtCtxTime = 0;
  private pausedOffset = 0;
  private playbackRate = 1;
  private acousticSpace: AcousticSpace = "campfire";
  private ambienceEnabled = true;
  private ambienceLevel = 0.35;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  async decodeWavBase64(base64: string): Promise<{
    audioBuffer: AudioBuffer;
    durationSec: number;
    waveform: number[];
  }> {
    const ctx = this.ensureContext();
    const arrayBuffer = base64ToArrayBuffer(base64);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const waveform = extractWaveformPeaks(audioBuffer, 88);
    return {
      audioBuffer,
      durationSec: audioBuffer.duration,
      waveform,
    };
  }

  setBuffer(buffer: AudioBuffer | null): void {
    this.stopVoiceOnly();
    this.activeBuffer = buffer;
    this.pausedOffset = 0;
  }

  getBuffer(): AudioBuffer | null {
    return this.activeBuffer;
  }

  setPlaybackRate(rate: number): void {
    const current = this.getCurrentTime();
    this.playbackRate = rate;
    if (this.voiceSource && this.isPlaying) {
      this.voiceSource.playbackRate.value = rate;
      if (this.ctx) {
        this.startedAtCtxTime = this.ctx.currentTime - current / rate;
      }
    }
  }

  setAcousticSpace(space: AcousticSpace): void {
    const wasPlaying = this.isPlaying;
    const pos = this.getCurrentTime();
    this.acousticSpace = space;
    if (wasPlaying && this.activeBuffer) {
      this.play(pos);
    }
  }

  setAmbience(enabled: boolean, level: number): void {
    this.ambienceEnabled = enabled;
    this.ambienceLevel = level;
    if (this.campfireGain && this.ctx) {
      const target = enabled && this.isPlaying ? level * 0.55 : 0;
      this.campfireGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    if (enabled && this.isPlaying && !this.campfireSource) {
      this.startCampfireLayer();
    } else if (!enabled && this.campfireSource) {
      this.stopCampfireLayer();
    }
  }

  private startCampfireLayer(): void {
    if (!this.ambienceEnabled) return;
    const ctx = this.ensureContext();
    if (!this.campfireBuffer) {
      this.campfireBuffer = createCampfireLoopBuffer(ctx);
    }
    this.stopCampfireLayer();

    const source = ctx.createBufferSource();
    source.buffer = this.campfireBuffer;
    source.loop = true;

    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = "lowpass";
    warmthFilter.frequency.value = 3400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      Math.max(0.01, this.ambienceLevel * 0.55),
      ctx.currentTime + 0.18
    );

    source.connect(warmthFilter);
    warmthFilter.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);

    this.campfireSource = source;
    this.campfireGain = gain;
  }

  private stopCampfireLayer(): void {
    if (this.campfireSource) {
      try {
        this.campfireSource.stop();
        this.campfireSource.disconnect();
      } catch {
        // Already stopped
      }
      this.campfireSource = null;
    }
    if (this.campfireGain) {
      try {
        this.campfireGain.disconnect();
      } catch {
        // Already disconnected
      }
      this.campfireGain = null;
    }
  }

  private stopVoiceOnly(): void {
    if (this.voiceSource) {
      this.voiceSource.onended = null;
      try {
        this.voiceSource.stop();
        this.voiceSource.disconnect();
      } catch {
        // Already stopped
      }
      this.voiceSource = null;
    }
    this.isPlaying = false;
  }

  play(fromOffsetSec?: number, onEnded?: () => void): void {
    if (!this.activeBuffer) return;
    const ctx = this.ensureContext();
    this.stopVoiceOnly();

    const duration = this.activeBuffer.duration;
    let offset =
      fromOffsetSec !== undefined ? fromOffsetSec : this.pausedOffset;
    if (offset >= duration - 0.04 || offset < 0) {
      offset = 0;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.activeBuffer;
    source.playbackRate.value = this.playbackRate;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;

    if (this.acousticSpace === "dry") {
      source.connect(masterGain);
    } else if (this.acousticSpace === "campfire") {
      // Warm outdoor presence: subtle low-mid chest boost + brief open-air reflection
      const chestEq = ctx.createBiquadFilter();
      chestEq.type = "lowshelf";
      chestEq.frequency.value = 220;
      chestEq.gain.value = 2.8;

      if (!this.outdoorIR) {
        this.outdoorIR = createImpulseResponse(ctx, 0.32, 4.2, 2200);
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = this.outdoorIR;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.88;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.22;

      source.connect(chestEq);
      chestEq.connect(dryGain);
      chestEq.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
    } else {
      // Cavern Hall: stone chamber reflection
      if (!this.cavernIR) {
        this.cavernIR = createImpulseResponse(ctx, 1.45, 2.6, 1800);
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = this.cavernIR;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.72;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.42;

      source.connect(dryGain);
      source.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
    }

    if (this.analyser) {
      masterGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } else {
      masterGain.connect(ctx.destination);
    }

    this.voiceSource = source;
    this.isPlaying = true;
    this.pausedOffset = offset;
    this.startedAtCtxTime = ctx.currentTime - offset / this.playbackRate;

    if (this.ambienceEnabled) {
      this.startCampfireLayer();
    }

    source.onended = () => {
      if (this.voiceSource === source) {
        this.isPlaying = false;
        this.pausedOffset = 0;
        this.voiceSource = null;
        this.stopCampfireLayer();
        onEnded?.();
      }
    };

    source.start(0, offset);
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pausedOffset = this.getCurrentTime();
    this.stopVoiceOnly();
    this.stopCampfireLayer();
  }

  stop(): void {
    this.pausedOffset = 0;
    this.stopVoiceOnly();
    this.stopCampfireLayer();
  }

  getCurrentTime(): number {
    if (!this.activeBuffer) return 0;
    if (!this.isPlaying || !this.ctx) return this.pausedOffset;
    const elapsed =
      (this.ctx.currentTime - this.startedAtCtxTime) * this.playbackRate;
    return Math.max(0, Math.min(this.activeBuffer.duration, elapsed));
  }

  getEnergyLevel(): number {
    if (!this.analyser || !this.isPlaying) return 0;
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i];
    return sum / (bins.length * 255);
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
