import { cn } from "@/lib/utils";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/jaylor";

export function StitchTrack({
  status,
  className,
  compact = false,
}: {
  status: OrderStatus;
  className?: string;
  compact?: boolean;
}) {
  const currentIndex = ORDER_STATUSES.indexOf(status);

  return (
    <ol className={cn("flex w-full items-start gap-0 overflow-x-auto", className)}>
      {ORDER_STATUSES.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-[1.5px] flex-1",
                  i === 0 && "opacity-0",
                  done || current ? "bg-gold" : "stitch-x opacity-50",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "mx-1 size-2.5 shrink-0 rounded-full border",
                  done && "border-gold bg-gold",
                  current && "animate-stitch-pulse border-gold bg-gold",
                  !done && !current && "border-border bg-background",
                )}
              />
              <span
                className={cn(
                  "h-[1.5px] flex-1",
                  i === ORDER_STATUSES.length - 1 && "opacity-0",
                  done ? "bg-gold" : "stitch-x opacity-50",
                )}
              />
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-center text-[10px] leading-tight",
                compact && "sr-only",
                current
                  ? "font-semibold text-foreground"
                  : "hidden text-muted-foreground sm:block",
              )}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
