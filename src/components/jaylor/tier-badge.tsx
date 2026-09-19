import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/jaylor";

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-gold px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold",
        className,
      )}
    >
      {tier}
    </span>
  );
}
