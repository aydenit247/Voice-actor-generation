// Client-side microphone recording and audio file decoding for Trio Adventures Script Studio.
// Normalizes any browser-recorded or uploaded audio to 24kHz mono 16-bit WAV so it flows
// cleanly through the exact same IndexedDB storage, DSP effects chain, sync, and ZIP export as AI takes.

import { encodeWav } from "./fx";

export const TARGET_SAMPLE_RATE = 24000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB safety cap

export interface DecodedVoiceTake {
  audioBase64: string;
  durationSec: number;
}

export interface MicLevel {
  rms: number;      // 0..1 normalized loudness
  peak: number;     // 0..1 peak amplitude
  clipping: boolean;
}

export interface MicSession {
  getLevel: () => MicLevel;
  stop: () => Promise<DecodedVoiceTake>;
  cancel: () => void;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Decodes any browser-supported audio buffer (WAV, MP3, M4A, OGG, WebM, FLAC),
 * mixes down to mono and resamples to 24kHz via OfflineAudioContext, then encodes
 * to 16-bit PCM WAV base64.
 */
export async function decodeAndNormalizeToWav24k(data: ArrayBuffer): Promise<DecodedVoiceTake> {
  if (!data || data.byteLength < 64) {
    throw new Error("That recording or audio file appears to be empty.");
  }

  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(data.slice(0));
  } catch {
    throw new Error("Could not decode that audio. Try WAV, MP3, M4A, OGG, or WebM.");
  } finally {
    await decodeCtx.close().catch(() => {});
  }

  if (decoded.duration < 0.08 || decoded.length < 100) {
    throw new Error("Recording is too short. Try recording at least a moment of speech.");
  }

  // Mix down to mono and resample to 24kHz
  const targetLen = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, targetLen, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const mono24k = await offline.startRendering();

  const wavBytes = encodeWav(mono24k);
  return {
    audioBase64: bytesToBase64(wavBytes),
    durationSec: mono24k.duration,
  };
}

export async function importAudioFile(file: File): Promise<DecodedVoiceTake> {
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is larger than 50 MB. Please trim it first.`);
  }
  const buf = await file.arrayBuffer();
  return decodeAndNormalizeToWav24k(buf);
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function friendlyMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone access was blocked. Allow microphone permission in your browser and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found on this device. Connect a mic or use Upload instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is busy in another app. Close the other app or pick a different input.";
  }
  return err instanceof Error ? err.message : "Could not start the microphone.";
}

export async function startMicRecorder(deviceId?: string): Promise<MicSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Live microphone recording isn't supported in this browser. You can still upload an audio file.");
  }

  let stream: MediaStream;
  try {
    // Request clean, raw mic capture so our studio DSP (cleanup, formant, grit, spaces) has full fidelity
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (primaryErr) {
    // Some browsers/mics reject explicit raw constraints; retry with standard audio request
    if (primaryErr instanceof DOMException && (primaryErr.name === "NotAllowedError" || primaryErr.name === "PermissionDeniedError")) {
      throw new Error(friendlyMicError(primaryErr));
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
    } catch (fallbackErr) {
      throw new Error(friendlyMicError(fallbackErr));
    }
  }

  const meterCtx = new AudioContext();
  if (meterCtx.state === "suspended") {
    await meterCtx.resume().catch(() => {});
  }
  const mediaSource = meterCtx.createMediaStreamSource(stream);
  const analyser = meterCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.25;
  mediaSource.connect(analyser);
  const timeData = new Float32Array(analyser.fftSize);

  const mimeType = pickRecorderMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let cleanedUp = false;
  const release = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    stream.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* ignore */ }
    });
    meterCtx.close().catch(() => {});
  };

  recorder.start(120);

  return {
    getLevel(): MicLevel {
      analyser.getFloatTimeDomainData(timeData);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = Math.abs(timeData[i]);
        sum += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sum / timeData.length);
      return {
        rms: Math.min(1, rms * 3.5),
        peak: Math.min(1, peak),
        clipping: peak >= 0.96,
      };
    },
    stop(): Promise<DecodedVoiceTake> {
      return new Promise((resolve, reject) => {
        if (recorder.state === "inactive") {
          release();
          reject(new Error("Recording already stopped."));
          return;
        }
        recorder.onerror = () => {
          release();
          reject(new Error("Microphone recording interrupted."));
        };
        recorder.onstop = async () => {
          release();
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            const arrayBuf = await blob.arrayBuffer();
            const normalized = await decodeAndNormalizeToWav24k(arrayBuf);
            resolve(normalized);
          } catch (err) {
            reject(err);
          }
        };
        recorder.stop();
      });
    },
    cancel(): void {
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* ignore */ }
      }
      release();
    },
  };
}
