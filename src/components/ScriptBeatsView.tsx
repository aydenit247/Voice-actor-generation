import type { ScriptSegment } from "../types/studio";

/**
 * Splits a character script into stage-cue segments ([angry], [pause], <breath>)
 * and spoken dialogue beats with proportional timing weights for live highlighting.
 */
export function parseScriptSegments(script: string): ScriptSegment[] {
  const tokenRegex = /(\[[^\]]+\]|<[^>]+>)/g;
  const rawParts = script.split(tokenRegex).filter((part) => part.length > 0);

  const weights = rawParts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return 0;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return trimmed.toLowerCase().includes("pause") ? 14 : 2;
    }
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      return 6;
    }
    return Math.max(8, trimmed.length);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;
  let cursor = 0;

  return rawParts
    .map((part, idx): ScriptSegment | null => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const w = weights[idx];
      const startWeight = cursor / totalWeight;
      cursor += w;
      const endWeight = cursor / totalWeight;
      const isCue =
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("<") && trimmed.endsWith(">"));
      return {
        type: isCue ? "cue" : "speech",
        text: trimmed,
        startWeight,
        endWeight,
      };
    })
    .filter((seg): seg is ScriptSegment => seg !== null);
}

interface ScriptBeatsViewProps {
  script: string;
  progress: number;
  isPlaying: boolean;
  compact?: boolean;
}

export function ScriptBeatsView({
  script,
  progress,
  isPlaying,
  compact = false,
}: ScriptBeatsViewProps) {
  const segments = parseScriptSegments(script);

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base leading-relaxed"
          : "flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 text-xl sm:text-2xl leading-snug"
      }
      aria-live="polite"
    >
      {segments.map((segment, index) => {
        const isActive =
          isPlaying &&
          progress >= segment.startWeight &&
          progress <= segment.endWeight + 0.04;
        const isPast = isPlaying && progress > segment.endWeight + 0.04;

        if (segment.type === "cue") {
          return (
            <span
              key={`${segment.text}-${index}`}
              className={`font-mono text-xs tracking-wide transition-colors duration-150 ${
                isActive
                  ? "text-[#E86F25]"
                  : isPast
                    ? "text-stone-500"
                    : "text-stone-400"
              }`}
            >
              {segment.text}
            </span>
          );
        }

        return (
          <span
            key={`${segment.text}-${index}`}
            className={`font-display transition-colors duration-150 ${
              isActive
                ? "text-[#F5F2EB]"
                : isPast
                  ? "text-stone-300"
                  : isPlaying
                    ? "text-stone-400"
                    : "text-[#F5F2EB]"
            }`}
          >
            {segment.text}
          </span>
        );
      })}
    </div>
  );
}
