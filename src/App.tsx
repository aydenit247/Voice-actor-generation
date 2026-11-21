/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Wand2,
} from "lucide-react";
import { CharacterImage } from "./components/CharacterImage";
import { ScriptBeatsView } from "./components/ScriptBeatsView";
import { TakesHistory } from "./components/TakesHistory";
import { WaveformPlayer } from "./components/WaveformPlayer";
import {
  CHARACTER_PRESETS,
  PERFORMANCE_CUES,
  VOICE_OPTIONS,
} from "./data/presets";
import type {
  AcousticSpace,
  AudioTake,
  CharacterPreset,
  PrebuiltVoiceName,
  TtsModelId,
} from "./types/studio";
import {
  downloadWavFile,
  StudioAudioEngine,
} from "./utils/audioEngine";

const DEFAULT_PRESET = CHARACTER_PRESETS[0];

export default function App() {
  const [selectedPreset, setSelectedPreset] =
    useState<CharacterPreset>(DEFAULT_PRESET);
  const [script, setScript] = useState<string>(DEFAULT_PRESET.script);
  const [style, setStyle] = useState<string>(DEFAULT_PRESET.style);
  const [voiceName, setVoiceName] = useState<PrebuiltVoiceName>(
    DEFAULT_PRESET.voiceName
  );
  const [ttsModel, setTtsModel] = useState<TtsModelId>("gemini-3.8-flash-tts");

  const [takes, setTakes] = useState<AudioTake[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWritingLine, setIsWritingLine] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [voiceEnergy, setVoiceEnergy] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [acousticSpace, setAcousticSpace] = useState<AcousticSpace>(
    DEFAULT_PRESET.defaultSpace
  );
  const [ambienceEnabled, setAmbienceEnabled] = useState<boolean>(
    DEFAULT_PRESET.defaultAmbience
  );
  const [ambienceLevel, setAmbienceLevel] = useState<number>(0.4);

  const engineRef = useRef<StudioAudioEngine | null>(null);
  const decodedBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const takeCounterRef = useRef(0);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeTake = takes.find((t) => t.id === activeTakeId) ?? null;

  // Initialize studio audio engine once
  useEffect(() => {
    const engine = new StudioAudioEngine();
    engine.setAcousticSpace(DEFAULT_PRESET.defaultSpace);
    engine.setAmbience(DEFAULT_PRESET.defaultAmbience, 0.4);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Animation loop for smooth playhead timecode & speaking glow
  useEffect(() => {
    if (!isPlaying) {
      setVoiceEnergy(0);
      return;
    }
    let rafId = 0;
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        setCurrentTime(engine.getCurrentTime());
        setVoiceEnergy(engine.getEnergyLevel());
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const handlePlaybackEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setVoiceEnergy(0);
  }, []);

  const ensureTakeLoaded = useCallback(
    async (take: AudioTake): Promise<boolean> => {
      const engine = engineRef.current;
      if (!engine) return false;
      let buffer = decodedBuffersRef.current.get(take.id);
      if (!buffer) {
        const decoded = await engine.decodeWavBase64(take.audioBase64);
        buffer = decoded.audioBuffer;
        decodedBuffersRef.current.set(take.id, buffer);
      }
      engine.setBuffer(buffer);
      setActiveTakeId(take.id);
      return true;
    },
    []
  );

  const handleGeneratePerformance = async () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setErrorMessage("Enter a dialogue line before generating audio.");
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);
    engineRef.current?.stop();
    setIsPlaying(false);
    setCurrentTime(0);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: trimmedScript,
          style: style.trim(),
          voiceName,
          model: ttsModel,
        }),
      });

      const payload = (await response.json()) as {
        audioBase64?: string;
        mimeType?: string;
        voiceName?: PrebuiltVoiceName;
        model?: TtsModelId;
        byteLength?: number;
        error?: string;
      };

      if (!response.ok || !payload.audioBase64) {
        throw new Error(
          payload.error || "Speech generation failed. Please try again."
        );
      }

      const engine = engineRef.current;
      if (!engine) {
        throw new Error("Audio engine is not initialized.");
      }

      const decoded = await engine.decodeWavBase64(payload.audioBase64);
      takeCounterRef.current += 1;
      const takeId = `take-${Date.now()}-${takeCounterRef.current}`;

      const now = new Date();
      const timestamp = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const newTake: AudioTake = {
        id: takeId,
        takeNumber: takeCounterRef.current,
        characterId: selectedPreset.id,
        characterName: selectedPreset.name,
        voiceName: payload.voiceName ?? voiceName,
        model: payload.model ?? ttsModel,
        style: style.trim(),
        script: trimmedScript,
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType || "audio/wav",
        durationSec: decoded.durationSec,
        waveform: decoded.waveform,
        byteLength: payload.byteLength ?? Math.round((payload.audioBase64.length * 3) / 4),
        createdAt: timestamp,
      };

      decodedBuffersRef.current.set(takeId, decoded.audioBuffer);
      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(takeId);

      engine.setBuffer(decoded.audioBuffer);
      engine.setPlaybackRate(playbackRate);
      engine.setAcousticSpace(acousticSpace);
      engine.setAmbience(ambienceEnabled, ambienceLevel);
      engine.play(0, handlePlaybackEnded);
      setIsPlaying(true);
      setCurrentTime(0);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unable to generate speech performance."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTogglePlay = async () => {
    const engine = engineRef.current;
    if (!engine || !activeTake) return;

    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
      return;
    }

    if (!engine.getBuffer()) {
      await ensureTakeLoaded(activeTake);
    }
    engine.setPlaybackRate(playbackRate);
    engine.setAcousticSpace(acousticSpace);
    engine.setAmbience(ambienceEnabled, ambienceLevel);
    engine.play(undefined, handlePlaybackEnded);
    setIsPlaying(true);
  };

  const handleReplay = async () => {
    const engine = engineRef.current;
    if (!engine || !activeTake) return;
    if (!engine.getBuffer()) {
      await ensureTakeLoaded(activeTake);
    }
    engine.setPlaybackRate(playbackRate);
    engine.setAcousticSpace(acousticSpace);
    engine.setAmbience(ambienceEnabled, ambienceLevel);
    engine.play(0, handlePlaybackEnded);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleSeek = (seconds: number) => {
    const engine = engineRef.current;
    if (!engine || !activeTake) return;
    setCurrentTime(seconds);
    if (isPlaying) {
      engine.play(seconds, handlePlaybackEnded);
    } else {
      engine.play(seconds, handlePlaybackEnded);
      setIsPlaying(true);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    engineRef.current?.setPlaybackRate(rate);
  };

  const handleAcousticSpaceChange = (space: AcousticSpace) => {
    setAcousticSpace(space);
    engineRef.current?.setAcousticSpace(space);
  };

  const handleAmbienceToggle = () => {
    const next = !ambienceEnabled;
    setAmbienceEnabled(next);
    engineRef.current?.setAmbience(next, ambienceLevel);
  };

  const handleAmbienceLevelChange = (level: number) => {
    setAmbienceLevel(level);
    engineRef.current?.setAmbience(ambienceEnabled, level);
  };

  const handleSelectPreset = (preset: CharacterPreset) => {
    engineRef.current?.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    setErrorMessage(null);

    setSelectedPreset(preset);
    setScript(preset.script);
    setStyle(preset.style);
    setVoiceName(preset.voiceName);
    setAcousticSpace(preset.defaultSpace);
    setAmbienceEnabled(preset.defaultAmbience);
    engineRef.current?.setAcousticSpace(preset.defaultSpace);
    engineRef.current?.setAmbience(preset.defaultAmbience, ambienceLevel);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleInsertCue = (token: string) => {
    const textarea = scriptTextareaRef.current;
    if (!textarea) {
      setScript((prev) => `${prev.trim()} ${token} `.trimStart());
      return;
    }
    const start = textarea.selectionStart ?? script.length;
    const end = textarea.selectionEnd ?? script.length;
    const before = script.slice(0, start);
    const after = script.slice(end);
    const needsLeadSpace = before.length > 0 && !before.endsWith(" ");
    const needsTrailSpace = after.length > 0 && !after.startsWith(" ");
    const insertion = `${needsLeadSpace ? " " : ""}${token}${needsTrailSpace ? " " : " "}`;
    const updated = `${before}${insertion}${after}`;
    setScript(updated);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = before.length + insertion.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handleWriteNewLine = async () => {
    setErrorMessage(null);
    setIsWritingLine(true);
    try {
      const response = await fetch("/api/write-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: selectedPreset.name,
          style,
          currentScript: script,
        }),
      });
      const payload = (await response.json()) as {
        script?: string;
        error?: string;
      };
      if (!response.ok || !payload.script) {
        throw new Error(payload.error || "Unable to write a new line.");
      }
      setScript(payload.script);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not generate a new line."
      );
    } finally {
      setIsWritingLine(false);
    }
  };

  const handleResetPreset = () => {
    setScript(selectedPreset.script);
    setStyle(selectedPreset.style);
    setVoiceName(selectedPreset.voiceName);
    setErrorMessage(null);
  };

  const handleSelectAndPlayTake = async (take: AudioTake) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (activeTakeId === take.id && isPlaying) {
      engine.pause();
      setIsPlaying(false);
      return;
    }

    await ensureTakeLoaded(take);
    engine.setPlaybackRate(playbackRate);
    engine.setAcousticSpace(acousticSpace);
    engine.setAmbience(ambienceEnabled, ambienceLevel);
    engine.play(0, handlePlaybackEnded);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleLoadTakeIntoEditor = (take: AudioTake) => {
    const matchingPreset = CHARACTER_PRESETS.find(
      (p) => p.id === take.characterId
    );
    if (matchingPreset) {
      setSelectedPreset(matchingPreset);
    }
    setScript(take.script);
    setStyle(take.style);
    setVoiceName(take.voiceName);
    setTtsModel(take.model);
    document
      .getElementById("direction")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDownloadTake = (take: AudioTake) => {
    const slug = take.characterName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadWavFile(
      take.audioBase64,
      `${slug}-take-${String(take.takeNumber).padStart(2, "0")}.wav`
    );
  };

  const handleDeleteTake = (takeId: string) => {
    if (activeTakeId === takeId) {
      engineRef.current?.stop();
      engineRef.current?.setBuffer(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveTakeId(null);
    }
    decodedBuffersRef.current.delete(takeId);
    setTakes((prev) => prev.filter((t) => t.id !== takeId));
  };

  const playbackProgress =
    activeTake && activeTake.durationSec > 0
      ? currentTime / activeTake.durationSec
      : 0;

  // Strip cues for clean editorial hero headline display
  const cleanSpokenHeadline = script
    .replace(/\[[^\]]+\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <div className="min-h-screen bg-[#0B0A09] text-[#F5F2EB]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B0A09]/92 backdrop-blur-md border-b border-stone-800/80">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#stage"
            className="font-display text-xl font-semibold tracking-tight text-[#F5F2EB] whitespace-nowrap shrink-0"
          >
            Emberstage
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-400"
          >
            <a
              href="#stage"
              className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Stage
            </a>
            <a
              href="#direction"
              className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Direction
            </a>
            <a
              href="#presets"
              className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Presets
            </a>
            <a
              href="#takes"
              className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Takes
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleGeneratePerformance}
              disabled={isGenerating}
              className="h-10 px-4 rounded-lg bg-[#E86F25] hover:bg-[#F28238] disabled:opacity-60 text-[#0B0A09] text-xs font-semibold inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate Audio</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-5 sm:px-8">
        {/* Error Banner (non-color-only with explicit icon & message) */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-xl bg-red-950/40 border border-red-900/70 px-4 py-3.5 flex items-start justify-between gap-4 text-sm text-red-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs font-medium text-red-300 hover:text-red-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Section 1: Hero Performance Stage (Balanced 2-Column items-stretch) */}
        <section id="stage" className="scroll-mt-20 pt-8 sm:pt-10 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Character Direction, Dramatic Quote & Dominant CTA */}
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400 mb-4">
                  <span className="text-stone-200 font-medium">
                    {selectedPreset.name}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPreset.setting}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{voiceName}</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.12] text-[#F5F2EB] mb-5 max-w-xl">
                  “{cleanSpokenHeadline || "Write a line to perform."}”
                </h1>

                <p className="text-sm sm:text-base text-stone-300 leading-relaxed max-w-xl mb-6">
                  {style}
                </p>

                {/* Live Beat Script Breakdown */}
                <div className="pt-5 border-t border-stone-800/80 mb-8">
                  <p className="text-xs text-stone-500 mb-2">
                    Cue Sheet
                  </p>
                  <ScriptBeatsView
                    script={script}
                    progress={playbackProgress}
                    isPlaying={isPlaying}
                    compact
                  />
                </div>
              </div>

              {/* Action Bar — One Dominant Primary CTA */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGeneratePerformance}
                  disabled={isGenerating}
                  className="h-12 px-6 rounded-lg bg-[#E86F25] hover:bg-[#F28238] disabled:opacity-60 text-[#0B0A09] font-semibold text-sm inline-flex items-center gap-2.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Performing Line...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" aria-hidden="true" />
                      <span>Generate Performance</span>
                    </>
                  )}
                </button>

                {activeTake && (
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="h-12 px-5 rounded-lg bg-[#1C1917] hover:bg-stone-800 text-[#F5F2EB] font-medium text-sm border border-stone-800 inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                        <span>Pause Take</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                        <span>Listen Again</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Full-Height Editorial Character Scene */}
            <div className="lg:col-span-6">
              <div
                className="relative h-full min-h-[300px] sm:min-h-[380px] rounded-xl overflow-hidden border border-stone-800/90 bg-[#141210]"
                style={{
                  boxShadow: isPlaying
                    ? `0 0 ${Math.round(24 + voiceEnergy * 42)}px rgba(232, 111, 37, ${0.14 + voiceEnergy * 0.24})`
                    : undefined,
                }}
              >
                <CharacterImage
                  src={selectedPreset.imageUrl}
                  alt={selectedPreset.imageAlt}
                  fallbackTitle={selectedPreset.name}
                  className="w-full h-full lg:h-full object-cover object-center"
                />
                {/* Measured Scrim for WCAG AA Legibility */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#0B0A09]/92 via-[#0B0A09]/25 to-transparent"
                />

                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4 text-xs text-stone-300 mb-2">
                    <span>{selectedPreset.archetype}</span>
                    <span className="font-mono tabular-nums text-stone-400">
                      {isGenerating
                        ? "Synthesizing..."
                        : isPlaying
                          ? "Speaking"
                          : activeTake
                            ? `Take ${String(activeTake.takeNumber).padStart(2, "0")}`
                            : "Standby"}
                    </span>
                  </div>
                  <ScriptBeatsView
                    script={script}
                    progress={playbackProgress}
                    isPlaying={isPlaying}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Waveform Playback & Soundstage Deck Below Hero Split */}
          <div className="mt-8">
            <WaveformPlayer
              take={activeTake}
              isGenerating={isGenerating}
              isPlaying={isPlaying}
              currentTime={currentTime}
              playbackRate={playbackRate}
              acousticSpace={acousticSpace}
              ambienceEnabled={ambienceEnabled}
              ambienceLevel={ambienceLevel}
              onTogglePlay={handleTogglePlay}
              onReplay={handleReplay}
              onSeek={handleSeek}
              onPlaybackRateChange={handlePlaybackRateChange}
              onAcousticSpaceChange={handleAcousticSpaceChange}
              onAmbienceToggle={handleAmbienceToggle}
              onAmbienceLevelChange={handleAmbienceLevelChange}
              onDownload={() => activeTake && handleDownloadTake(activeTake)}
              onGenerate={handleGeneratePerformance}
            />
          </div>
        </section>

        {/* Section 2: Script & Voice Direction Studio */}
        <section
          id="direction"
          className="scroll-mt-24 py-12 border-t border-stone-800/80"
        >
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs text-stone-400 mb-1.5">
                Performance Controls
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F2EB]">
                Script & Voice Direction
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleWriteNewLine}
                disabled={isWritingLine}
                className="h-10 px-4 rounded-lg bg-[#1C1917] hover:bg-stone-800 disabled:opacity-60 text-[#F5F2EB] text-xs font-medium border border-stone-800 inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25]"
              >
                {isWritingLine ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Writing...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5 text-[#E86F25]" aria-hidden="true" />
                    <span>Write New Line</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetPreset}
                className="h-10 px-3.5 rounded-lg bg-transparent hover:bg-[#1C1917] text-stone-400 hover:text-[#F5F2EB] text-xs font-medium border border-stone-800 inline-flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Script Editor + Cue Insertion Palette */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="script-editor"
                    className="text-sm font-medium text-stone-200"
                  >
                    Spoken Line & Stage Cues
                  </label>
                  <span className="text-xs font-mono tabular-nums text-stone-500">
                    {script.length} / 2000
                  </span>
                </div>
                <textarea
                  ref={scriptTextareaRef}
                  id="script-editor"
                  rows={5}
                  maxLength={2000}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="[angry] Who burned the map?! [pause] ...Oh. That was me."
                  className="w-full rounded-xl bg-[#141210] border border-stone-800 focus:border-[#E86F25] px-4 py-3.5 text-base leading-relaxed text-[#F5F2EB] placeholder:text-stone-600 outline-none transition-colors duration-150 resize-y"
                />
              </div>

              {/* Clickable Performance Cue Palette */}
              <div>
                <p className="text-xs text-stone-400 mb-2.5">
                  Insert acting cues at cursor
                </p>
                <div className="flex flex-wrap gap-2">
                  {PERFORMANCE_CUES.map((cue) => (
                    <button
                      key={cue.token}
                      type="button"
                      onClick={() => handleInsertCue(cue.token)}
                      className="h-9 px-3 rounded-lg bg-[#141210] hover:bg-[#1C1917] border border-stone-800 hover:border-stone-700 text-xs inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E86F25]"
                    >
                      <span className="font-mono text-[#E86F25]">
                        {cue.token}
                      </span>
                      <span className="text-stone-400">{cue.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Direction Input */}
              <div className="pt-2">
                <label
                  htmlFor="direction-editor"
                  className="block text-sm font-medium text-stone-200 mb-2"
                >
                  Character & Delivery Direction
                </label>
                <textarea
                  id="direction-editor"
                  rows={3}
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="Describe the character's personality, vocal texture, volume, breath, and setting..."
                  className="w-full rounded-xl bg-[#141210] border border-stone-800 focus:border-[#E86F25] px-4 py-3 text-sm leading-relaxed text-[#F5F2EB] placeholder:text-stone-600 outline-none transition-colors duration-150 resize-y"
                />
              </div>
            </div>

            {/* Cast Base Voice & Model Selector */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div>
                <p className="text-sm font-medium text-stone-200 mb-3">
                  Base Voice Timbre
                </p>
                <div
                  className="divide-y divide-stone-800/80 rounded-xl bg-[#141210] border border-stone-800/90 overflow-hidden"
                  role="radiogroup"
                  aria-label="Base voice timbre"
                >
                  {VOICE_OPTIONS.map((voice) => {
                    const selected = voiceName === voice.name;
                    return (
                      <button
                        key={voice.name}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setVoiceName(voice.name)}
                        className={`w-full text-left px-4 py-3.5 flex items-center justify-between gap-4 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#E86F25] ${
                          selected
                            ? "bg-[#1F1A17]"
                            : "hover:bg-[#191614]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span
                              className={`font-semibold ${
                                selected ? "text-[#F5F2EB]" : "text-stone-200"
                              }`}
                            >
                              {voice.name}
                            </span>
                            <span aria-hidden="true" className="text-stone-600">
                              ·
                            </span>
                            <span className="text-xs text-stone-400">
                              {voice.register}
                            </span>
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5 truncate">
                            {voice.timbre}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                            selected ? "text-[#E86F25]" : "text-stone-500"
                          }`}
                        >
                          {selected ? "Selected" : "Choose"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Speech Model Mode */}
              <div>
                <p className="text-sm font-medium text-stone-200 mb-2.5">
                  Speech Engine
                </p>
                <div
                  className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#141210] border border-stone-800/90"
                  role="group"
                  aria-label="Speech model selection"
                >
                  <button
                    type="button"
                    onClick={() => setTtsModel("gemini-3.8-flash-tts")}
                    className={`px-3 py-2.5 rounded-lg text-left transition-colors duration-150 cursor-pointer ${
                      ttsModel === "gemini-3.8-flash-tts"
                        ? "bg-[#26221F] text-[#F5F2EB]"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    <span className="block text-xs font-semibold whitespace-nowrap">
                      Voice Design
                    </span>
                    <span className="block text-[11px] text-stone-400 mt-0.5 truncate">
                      Expressive character acting
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTtsModel("gemini-3.8-flash-lite-tts")}
                    className={`px-3 py-2.5 rounded-lg text-left transition-colors duration-150 cursor-pointer ${
                      ttsModel === "gemini-3.8-flash-lite-tts"
                        ? "bg-[#26221F] text-[#F5F2EB]"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    <span className="block text-xs font-semibold whitespace-nowrap">
                      Fast Standard
                    </span>
                    <span className="block text-[11px] text-stone-400 mt-0.5 truncate">
                      Low-latency direct read
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Character Preset Roster */}
        <section
          id="presets"
          className="scroll-mt-24 py-12 border-t border-stone-800/80"
        >
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs text-stone-400 mb-1.5">Cast Presets</p>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F2EB]">
                Campfire & Tavern Roster
              </h2>
            </div>
            <p className="text-xs text-stone-400">
              Select a character to load their voice direction, cues, and acoustics
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CHARACTER_PRESETS.map((preset) => {
              const isSelected = preset.id === selectedPreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`group text-left rounded-xl overflow-hidden bg-[#141210] border transition-colors duration-150 flex flex-col cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25] ${
                    isSelected
                      ? "border-[#E86F25]"
                      : "border-stone-800/90 hover:border-stone-700"
                  }`}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[#1C1917]">
                    <CharacterImage
                      src={preset.imageUrl}
                      alt={preset.imageAlt}
                      fallbackTitle={preset.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-[#F5F2EB] mb-1">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-stone-400 mb-2">
                        {preset.voiceName} · {preset.setting}
                      </p>
                      <p className="text-xs text-stone-300 leading-relaxed line-clamp-2">
                        {preset.script}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        isSelected
                          ? "text-[#E86F25]"
                          : "text-stone-400 group-hover:text-[#F5F2EB]"
                      }`}
                    >
                      {isSelected ? "Active on stage" : "Load character"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 4: Session Audition Takes */}
        <TakesHistory
          takes={takes}
          activeTakeId={activeTakeId}
          isPlaying={isPlaying}
          onSelectAndPlay={handleSelectAndPlayTake}
          onLoadIntoEditor={handleLoadTakeIntoEditor}
          onDownload={handleDownloadTake}
          onDelete={handleDeleteTake}
        />
      </main>

      <footer className="border-t border-stone-800/80 py-8">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-stone-500">
          <span className="font-display text-sm text-stone-300">Emberstage</span>
          <span>24kHz WAV Voice Studio · Press Generate Performance to audition takes</span>
        </div>
      </footer>
    </div>
  );
}
