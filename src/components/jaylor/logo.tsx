import { cn } from "@/lib/utils";
import logoMark from "@/assets/jaylor-logo-mark.png";
import logoMarkGold from "@/assets/jaylor-logo-mark-gold.png";

/** The Jaylor mannequin, measuring-tape and needle "J" mark. */
export function LogoMark({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "gold";
}) {
  return (
    <img
      src={variant === "gold" ? logoMarkGold : logoMark}
      alt=""
      width={1024}
      height={1024}
      loading="lazy"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

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
      <LogoMark variant={dark ? "gold" : "full"} className={cn("size-10", markClassName)} />
      <span className="flex flex-col">
        <span className={cn("font-heading text-2xl leading-none", dark ? "text-foreground" : "text-ink")}>Jaylor</span>
        {showTagline && (
          <span className="mt-1 font-sans text-[8px] font-medium uppercase text-gold">Crafted for you</span>
        )}
      </span>
    </span>
  );
}
