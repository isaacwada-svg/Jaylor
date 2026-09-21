import { cn } from "@/lib/utils";
import officialLogo from "@/assets/jaylor-official-logo.png.asset.json";

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
        src={officialLogo.url}
        alt="Jaylor"
        width={1774}
        height={887}
        className={cn("h-12 w-auto object-contain", markClassName)}
      />
      {showTagline && (
        <span className={cn("sr-only", dark && "text-foreground")}>Crafted for you</span>
      )}
    </span>
  );
}
