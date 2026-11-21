import { useState } from "react";
import { Flame } from "lucide-react";

interface CharacterImageProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}

export function CharacterImage({
  src,
  alt,
  fallbackTitle,
  className = "",
}: CharacterImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#231812] via-[#151210] to-[#0B0A09] text-stone-400 ${className}`}
      >
        <Flame className="w-8 h-8 text-[#E86F25]/70 mb-2" aria-hidden="true" />
        <span className="font-display text-sm text-stone-300 px-4 text-center">
          {fallbackTitle}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
