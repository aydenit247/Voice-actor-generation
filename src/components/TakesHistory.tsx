import { Download, Pause, Play, Trash2 } from "lucide-react";
import type { AudioTake } from "../types/studio";
import { formatTimecode } from "../utils/audioEngine";

interface TakesHistoryProps {
  takes: AudioTake[];
  activeTakeId: string | null;
  isPlaying: boolean;
  onSelectAndPlay: (take: AudioTake) => void;
  onLoadIntoEditor: (take: AudioTake) => void;
  onDownload: (take: AudioTake) => void;
  onDelete: (takeId: string) => void;
}

export function TakesHistory({
  takes,
  activeTakeId,
  isPlaying,
  onSelectAndPlay,
  onLoadIntoEditor,
  onDownload,
  onDelete,
}: TakesHistoryProps) {
  return (
    <section id="takes" className="scroll-mt-24 pt-14 pb-16 border-t border-stone-800/80">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-stone-400 mb-1.5">Session Audition Reel</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F2EB]">
            Recorded Takes
          </h2>
        </div>
        <p className="text-xs font-mono tabular-nums text-stone-400">
          {takes.length} {takes.length === 1 ? "take" : "takes"} in session
        </p>
      </div>

      {takes.length === 0 ? (
        <div className="rounded-xl bg-[#141210] border border-stone-800/80 px-6 py-10 text-center">
          <p className="text-sm text-stone-300 mb-1">No takes recorded yet.</p>
          <p className="text-xs text-stone-500">
            Generate a performance above to audition, compare voices, and export 24kHz WAV audio.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-stone-800/80 border-t border-b border-stone-800/80">
          {takes.map((take) => {
            const isActive = take.id === activeTakeId;
            const isThisPlaying = isActive && isPlaying;
            return (
              <div
                key={take.id}
                className={`py-4 px-3 sm:px-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-150 ${
                  isActive ? "bg-[#141210]" : "hover:bg-[#141210]/50"
                }`}
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectAndPlay(take)}
                    aria-label={
                      isThisPlaying
                        ? `Pause take ${take.takeNumber}`
                        : `Play take ${take.takeNumber}`
                    }
                    className={`w-10 h-10 rounded-lg inline-flex items-center justify-center shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E86F25] ${
                      isThisPlaying
                        ? "bg-[#E86F25] text-[#0B0A09]"
                        : "bg-[#1C1917] text-[#F5F2EB] border border-stone-800 hover:bg-stone-800"
                    }`}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400 font-mono tabular-nums mb-1">
                      <span className="text-[#F5F2EB] font-medium">
                        {String(take.takeNumber).padStart(2, "0")}.
                      </span>
                      <span className="font-sans text-stone-300 font-medium">
                        {take.characterName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{take.voiceName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimecode(take.durationSec)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{take.createdAt}</span>
                    </div>
                    <p className="text-sm text-stone-200 truncate max-w-2xl">
                      {take.script}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => onLoadIntoEditor(take)}
                    className="h-9 px-3 rounded-lg text-xs font-medium text-stone-300 hover:text-[#F5F2EB] bg-[#1C1917] hover:bg-stone-800 border border-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Load Script
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(take)}
                    aria-label={`Download take ${take.takeNumber} WAV`}
                    className="h-9 px-3 rounded-lg text-xs font-medium text-stone-300 hover:text-[#F5F2EB] bg-[#1C1917] hover:bg-stone-800 border border-stone-800 inline-flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>WAV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(take.id)}
                    aria-label={`Delete take ${take.takeNumber}`}
                    className="h-9 w-9 rounded-lg text-stone-500 hover:text-red-400 hover:bg-red-950/30 inline-flex items-center justify-center transition-colors duration-150 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
