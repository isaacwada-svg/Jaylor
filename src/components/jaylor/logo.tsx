import { cn } from "@/lib/utils";
import logoMarkNavy from "@/assets/jaylor-logo-mark.png";
import logoMarkGold from "@/assets/jaylor-logo-mark-gold.png";

/** The Jaylor mannequin, measuring-tape and needle "J" mark. */
export function LogoMark({
  className,
  variant: _variant = "full",
}: {
  className?: string;
  variant?: "full" | "gold";
}) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      width={1024}
      height={1024}
      loading="eager"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/**
 * The mark image is a static PNG, so `dark` (true on the navy premium-public
 * background) picks the gold-on-transparent variant instead of the
 * navy-on-transparent one. The "Jaylor" wordmark next to it is real text
 * colored via `text-foreground`, which `.premium-public` already redefines
 * to the cream tone for that whole subtree — no separate dark styling needed.
 */
export function BrandLogo({
  className,
  markClassName,
  dark = false,
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  dark?: boolean;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={dark ? logoMarkGold : logoMarkNavy}
        alt=""
        width={1024}
        height={1024}
        loading="eager"
        className={cn("h-12 w-auto object-contain", markClassName)}
      />
      <span className="font-display text-2xl font-semibold leading-none tracking-tight text-foreground">
        Jaylor
      </span>
      {showTagline && <span className="sr-only">Crafted for you</span>}
    </span>
  );
}
