// Inline microphone recorder strip rendered directly inside a Trio Adventures LineCard.
// Shows live input level meter, elapsed time, optional mic device selector, Stop & Save, and Cancel.

import { useEffect, useRef, useState } from "react";
import { Loader2, Square, X } from "lucide-react";
import {
  listAudioInputs,
  startMicRecorder,
  type DecodedVoiceTake,
  type MicSession,
} from "./audioInput";

interface MicRecorderBarProps {
  onSaved: (take: DecodedVoiceTake) => Promise<void> | void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

function formatTimer(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const secs = totalSec % 60;
  const mins = Math.floor(totalSec / 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export default function MicRecorderBar({ onSaved, onCancel, onError }: MicRecorderBarProps) {
  const [status, setStatus] = useState<"starting" | "recording" | "saving">("starting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [sawSignal, setSawSignal] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");

  const sessionRef = useRef<MicSession | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    setStatus("starting");
    setElapsedMs(0);
    setLevel(0);
    setClipping(false);
    setSawSignal(false);

    startMicRecorder(deviceId || undefined)
      .then(async (session) => {
        if (!active) {
          session.cancel();
          return;
        }
        sessionRef.current = session;
        startTimeRef.current = performance.now();
        setStatus("recording");

        // Now that permission is granted, populate readable mic labels
        const inputs = await listAudioInputs();
        if (active && inputs.length > 0) setDevices(inputs);

        const tick = () => {
          if (!active || !sessionRef.current) return;
          const now = performance.now();
          setElapsedMs(now - startTimeRef.current);
          const lv = sessionRef.current.getLevel();
          setLevel(lv.rms);
          if (lv.peak > 0.015) setSawSignal(true);
          setClipping(lv.clipping);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((err) => {
        if (!active) return;
        onError(err instanceof Error ? err.message : "Could not access microphone.");
        onCancel();
      });

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      if (sessionRef.current) {
        sessionRef.current.cancel();
        sessionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleStopAndSave = async () => {
    const session = sessionRef.current;
    if (!session || status !== "recording") return;
    cancelAnimationFrame(rafRef.current);
    sessionRef.current = null;
    setStatus("saving");
    try {
      const result = await session.stop();
      await onSaved(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save recording.");
      onCancel();
    }
  };

  const handleCancel = () => {
    cancelAnimationFrame(rafRef.current);
    if (sessionRef.current) {
      sessionRef.current.cancel();
      sessionRef.current = null;
    }
    onCancel();
  };

  const meterPct = Math.min(100, Math.round(level * 100));
  const meterColor = clipping ? "bg-red-500" : meterPct > 72 ? "bg-amber-400" : "bg-emerald-500";
  const showSilentHint = status === "recording" && elapsedMs > 2200 && !sawSignal;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-red-900/60 bg-stone-950/90 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 whitespace-nowrap">
        {status === "recording" ? (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="font-semibold text-red-300">Recording</span>
          </>
        ) : (
          <>
            <Loader2 size={13} className="animate-spin text-stone-300" />
            <span className="font-semibold text-stone-300">
              {status === "starting" ? "Opening mic…" : "Processing WAV…"}
            </span>
          </>
        )}
      </div>

      <span className="font-mono text-sm tabular-nums text-stone-100">
        {formatTimer(elapsedMs)}
      </span>

      {/* Live level meter */}
      <div className="flex min-w-[120px] flex-1 items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded bg-stone-800"
          role="progressbar"
          aria-label="Microphone input level"
          aria-valuenow={meterPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full transition-[width] duration-75 ${meterColor}`}
            style={{ width: `${meterPct}%` }}
          />
        </div>
        {clipping && <span className="font-mono text-[11px] font-semibold text-red-400">CLIP</span>}
        {showSilentHint && !clipping && (
          <span className="whitespace-nowrap text-[11px] text-amber-300">No mic signal</span>
        )}
      </div>

      {devices.length > 1 && status === "recording" && (
        <select
          aria-label="Microphone input device"
          className="max-w-[180px] truncate rounded bg-stone-900 px-2 py-1 text-xs text-stone-300"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          <option value="">Default microphone</option>
          {devices.map((d, idx) => (
            <option key={d.deviceId || idx} value={d.deviceId}>
              {d.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={status !== "recording"}
          onClick={handleStopAndSave}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          <Square size={12} fill="currentColor" /> Stop &amp; Save
        </button>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={handleCancel}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-stone-800 px-2.5 py-1 text-stone-300 hover:bg-stone-700 hover:text-white disabled:opacity-50"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}
