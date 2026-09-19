import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TierBadge } from "./tier-badge";
import { StitchDivider } from "./stitch-divider";
import type { Tier } from "@/lib/jaylor";
import { cn } from "@/lib/utils";

export function LockedFeature({
  tier,
  title,
  value,
  preview,
  locked = true,
  children,
  className,
}: {
  tier: Tier;
  title: string;
  value: string;
  preview?: ReactNode;
  locked?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!locked) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} — locked, available on ${tier}`}
        className={cn(
          "relative block w-full touch-target text-left transition-opacity hover:opacity-95",
          className,
        )}
      >
        <div className="pointer-events-none opacity-55 blur-[1px]">{children}</div>
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/45">
          <Lock className="size-4 text-gold" aria-hidden />
          <TierBadge tier={tier} />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-2">
              <TierBadge tier={tier} />
            </div>
            <SheetTitle className="text-2xl">{title}</SheetTitle>
            <SheetDescription>{value}</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <div className="linen flex h-40 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
              {preview ?? "Preview"}
            </div>
            <StitchDivider className="my-5" />
            <Button className="w-full">Upgrade to {tier}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
