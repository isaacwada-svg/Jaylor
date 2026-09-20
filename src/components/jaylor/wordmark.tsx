import { cn } from "@/lib/utils";

/** The "Jaylor" wordmark, with the initial echoing the logo mark's gold. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading tracking-tight", className)}>
      <span className="text-gold">J</span>aylor
    </span>
  );
}
