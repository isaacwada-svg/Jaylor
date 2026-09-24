import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renderShareCard, canvasToPngBlob, type ShareCardSpec } from "@/lib/share-card";

const CONFETTI_COLORS = ["#D4AF37", "#111F39", "#F8F4E9"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 2.2 + Math.random() * 1.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.round(Math.random() * 360),
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-12px] size-2.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function ShareCardDialog({
  open,
  onOpenChange,
  spec,
  fileName,
  showConfetti = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ShareCardSpec;
  fileName: string;
  showConfetti?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open && canvasRef.current) renderShareCard(canvasRef.current, spec);
  }, [open, spec]);

  async function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToPngBlob(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToPngBlob(canvas);
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[] }) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
      } catch {
        // user cancelled the share sheet -- not an error
      }
    } else {
      await handleDownload();
      toast("Saved -- attach it to your WhatsApp message.");
    }
  }

  return (
    <>
      {open && showConfetti && <Confetti />}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share this moment</DialogTitle>
          </DialogHeader>
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl border border-border"
            style={{ aspectRatio: "1080 / 1920" }}
          />
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={() => void handleShare()}>
              <Share2 className="size-4" />
              Share
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => void handleDownload()}>
              <Download className="size-4" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
