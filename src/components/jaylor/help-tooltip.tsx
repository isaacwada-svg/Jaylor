import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A tap-to-open "?" affordance for contextual help next to a screen or
 * dialog's title. Uses a Popover rather than a hover-only Tooltip so it
 * works the same on touch devices, which is most of this app's traffic.
 */
export function HelpTooltip({
  children,
  className,
  align = "start",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Help"
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-gold",
            className,
          )}
        >
          <HelpCircle className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
