import React, { useEffect, useRef } from "react";
import {
  Download,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";
import type { AcousticSpace, AudioTake } from "../types/studio";
import { formatTimecode } from "../utils/audioEngine";

interface WaveformPlayerProps {
  take: AudioTake | null;
  isGenerating: boolean;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  acousticSpace: AcousticSpace;
  ambienceEnabled: boolean;
  ambienceLevel: number;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSeek: (seconds: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onAcousticSpaceChange: (space: AcousticSpace) => void;
  onAmbienceToggle: () => void;
  onAmbienceLevelChange: (level: number) => void;
  onDownload: () => void;
  onGenerate: () => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15];

const SPACE_OPTIONS: { id: AcousticSpace; label: string }[] = [
  { id: "campfire", label: "Campfire Night" },
  { id: "dry", label: "Dry Booth" },
  { id: "cavern", label: "Cavern Hall" },
];

// Subtle deterministic placeholder envelope before first take is generated
const IDLE_BARS = Array.from({ length: 88 }, (_, i) => {
  const x = i / 87;
  const burst1 = Math.exp(-Math.pow((x - 0.28) / 0.14, 2)) * 0.72;
  const burst2 = Math.exp(-Math.pow((x - 0.76) / 0.11, 2)) * 0.44;
  const texture = Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7)) * 0.22;
  return Math.max(0.1, Math.min(0.92, burst1 + burst2 + texture));
});

export function WaveformPlayer({
  take,
  isGenerating,
  isPlaying,
  currentTime,
  playbackRate,
  acousticSpace,
  ambienceEnabled,
  ambienceLevel,
  onTogglePlay,
  onReplay,
  onSeek,
  onPlaybackRateChange,
  onAcousticSpaceChange,
  onAmbienceToggle,
  onAmbienceLevelChange,
  onDownload,
  onGenerate,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const duration = take?.durationSec ?? 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const bars = take?.waveform ?? IDLE_BARS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const barCount = bars.length;
    const gap = 3;
    const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
    const centerY = height / 2;
    const maxBarHeight = height * 0.82;

    // Subtle horizontal zero-line
    ctx.fillStyle = "rgba(168, 162, 158, 0.14)";
    ctx.fillRect(0, centerY - 0.5, width, 1);

    for (let i = 0; i < barCount; i++) {
      const amp = bars[i];
      const barH = Math.max(4, amp * maxBarHeight);
      const x = i * (barWidth + gap);
      const y = centerY - barH / 2;
      const barRatio = (i + 0.5) / barCount;

      if (!take) {
        ctx.fillStyle = "rgba(120, 113, 108, 0.34)";
      } else if (barRatio <= progress) {
        ctx.fillStyle = "#E86F25";
      } else {
        ctx.fillStyle = "rgba(214, 211, 209, 0.32)";
      }

      const radius = Math.min(barWidth / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, radius);
      ctx.fill();
    }

    // Crisp vertical playhead cursor when a take exists
    if (take) {
      const playheadX = Math.max(1, Math.min(width - 1, progress * width));
      ctx.fillStyle = "#F5F2EB";
      ctx.fillRect(playheadX - 1, 4, 2, height - 8);
    }
  }, [bars, progress, take]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!take || duration <= 0) {
      if (!isGenerating) onGenerate();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const ratio = clickX / rect.width;
    onSeek(ratio * duration);
  };

  return (
    <section
      aria-label="Audio playback deck"
      className="rounded-xl bg-[#141210] border border-stone-800/90 p-5 sm:p-6"
    >
      {/* Top Transport & Metadata Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-stone-800/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={take ? onTogglePlay : onGenerate}
            disabled={isGenerating}
            aria-label={
              isGenerating
                ? "Generating audio"
                : !take
                  ? "Generate performance"
                  : isPlaying
                    ? "Pause playback"
                    : "Play playback"
            }
            className="h-11 px-5 rounded-lg bg-[#E86F25] hover:bg-[#F28238] disabled:opacity-60 text-[#0B0A09] font-semibold text-sm inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Generating...</span>
              </>
            ) : !take ? (
              <>
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Generate & Play</span>
              </>
            ) : isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Play Take</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReplay}
            disabled={!take || isGenerating}
            aria-label="Replay from beginning"
            className="h-11 px-3.5 rounded-lg bg-[#1C1917] hover:bg-stone-800 disabled:opacity-40 text-stone-200 text-sm font-medium inline-flex items-center gap-2 border border-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Replay</span>
          </button>

          <div className="pl-2 flex items-center gap-2 text-xs font-mono tabular-nums text-stone-400">
            <span className="text-[#F5F2EB]">
              {formatTimecode(currentTime)}
            </span>
            <span aria-hidden="true">/</span>
            <span>{take ? formatTimecode(duration) : "00:00.0"}</span>
          </div>
        </div>

        {/* Unboxed Audio Specs & Export */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-stone-400 font-mono tabular-nums">
            <span>{take ? `Take ${String(take.takeNumber).padStart(2, "0")}` : "Ready"}</span>
            <span aria-hidden="true">·</span>
            <span>{take ? take.voiceName : "24kHz WAV"}</span>
            {take && (
              <>
                <span aria-hidden="true">·</span>
                <span>{Math.max(1, Math.round(take.byteLength / 1024))} KB</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={!take}
            className="h-10 px-4 rounded-lg bg-[#1C1917] hover:bg-stone-800 disabled:opacity-40 text-[#F5F2EB] text-xs font-medium inline-flex items-center gap-2 border border-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download WAV</span>
          </button>
        </div>
      </div>

      {/* Interactive Waveform Canvas */}
      <div className="py-5">
        <div className="relative">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            role="slider"
            tabIndex={0}
            aria-label="Audio timeline scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 10) / 10}
            aria-valuenow={Math.round(currentTime * 10) / 10}
            onKeyDown={(e) => {
              if (!take) return;
              if (e.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 0.5));
              if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 0.5));
              if (e.key === " ") {
                e.preventDefault();
                onTogglePlay();
              }
            }}
            className="w-full h-24 block cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
          />
          {!take && !isGenerating && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-stone-400 bg-[#141210]/90 px-3 py-1.5 rounded-md border border-stone-800/80">
                Click Generate Performance to synthesize this voice take
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Acoustic Soundstage Controls Row */}
      <div className="pt-4 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-4">
        {/* Acoustic Space Segmented Control */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-stone-400">Acoustics</span>
          <div
            className="inline-flex items-center p-1 rounded-lg bg-[#0B0A09] border border-stone-800/90"
            role="group"
            aria-label="Acoustic space"
          >
            {SPACE_OPTIONS.map((option) => {
              const active = acousticSpace === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAcousticSpaceChange(option.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E86F25] ${
                    active
                      ? "bg-[#26221F] text-[#F5F2EB]"
                      : "text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campfire Ambience Mix + Speed */}
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onAmbienceToggle}
              aria-pressed={ambienceEnabled}
              className={`h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-2 border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E86F25] ${
                ambienceEnabled
                  ? "bg-[#E86F25]/15 border-[#E86F25]/45 text-[#F5F2EB]"
                  : "bg-[#0B0A09] border-stone-800 text-stone-400 hover:text-stone-200"
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 ${
                  ambienceEnabled ? "text-[#E86F25]" : "text-stone-500"
                }`}
                aria-hidden="true"
              />
              <span>Campfire Crackle</span>
            </button>

            <div className="flex items-center gap-2 w-28">
              <Volume2 className="w-3.5 h-3.5 text-stone-500 shrink-0" aria-hidden="true" />
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={ambienceLevel}
                disabled={!ambienceEnabled}
                onChange={(e) => onAmbienceLevelChange(Number(e.target.value))}
                aria-label="Campfire ambience volume"
                className="studio-slider w-full disabled:opacity-40 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-400">Speed</span>
            <div
              className="inline-flex items-center p-1 rounded-lg bg-[#0B0A09] border border-stone-800/90"
              role="group"
              aria-label="Playback speed"
            >
              {SPEED_OPTIONS.map((rate) => {
                const active = playbackRate === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onPlaybackRateChange(rate)}
                    className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? "bg-[#26221F] text-[#F5F2EB]"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {rate.toFixed(2).replace(/\.00$/, ".0")}x
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
