import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: string[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => setZoomed(false), [index]);

  if (index === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
      >
        <X className="size-5" />
      </button>

      <div
        className="flex flex-1 items-center justify-center overflow-hidden p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photos[index]}
          alt=""
          onClick={() => setZoomed((z) => !z)}
          className={cn(
            "max-h-full max-w-full object-contain transition-transform duration-200",
            zoomed ? "scale-[1.8] cursor-zoom-out" : "cursor-zoom-in",
          )}
        />
      </div>

      {photos.length > 1 && (
        <div
          className="flex items-center justify-center gap-6 pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm text-white/80">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => onIndexChange((index + 1) % photos.length)}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
