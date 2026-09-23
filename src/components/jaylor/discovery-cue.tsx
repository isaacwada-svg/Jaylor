import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DiscoveryBadge({ label = "Try this" }: { label?: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded-none border-gold/60 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold"
    >
      {label}
    </Badge>
  );
}

export function DiscoveryCue({
  show,
  pulse,
  children,
  className,
  label,
}: {
  show: boolean;
  pulse: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("relative", pulse && "animate-stitch-pulse", className)}>
      {children}
      {show ? (
        <div className="pointer-events-none absolute -right-1 -top-2 z-10">
          <DiscoveryBadge label={label} />
        </div>
      ) : null}
    </div>
  );
}