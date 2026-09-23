import { cn } from "@/lib/utils";
import logoMarkNavy from "@/assets/jaylor-logo-mark.png";
import logoMarkGold from "@/assets/jaylor-logo-mark-gold.png";
import primaryLogo from "@/assets/jaylor-primary-logo-v2.png";
import primaryLogoGold from "@/assets/jaylor-primary-logo-gold.png";

/**
 * The Jaylor mannequin, measuring-tape and needle "J" mark. This used to
 * render a separate photorealistic 3D rendition of the mark from a public
 * static file, while every other use of the mark (BrandLogo) rendered the
 * flat vector version -- the two looked like different logos depending on
 * where you saw them. Unified on the flat vector version everywhere.
 * "gold" is the default since the one place this renders (the sidebar
 * store-switcher badge) has a dark background, same as BrandLogo's `dark`.
 */
export function LogoMark({
  className,
  variant = "gold",
}: {
  className?: string;
  variant?: "full" | "gold";
}) {
  return (
    <img
      src={variant === "gold" ? logoMarkGold : logoMarkNavy}
      alt=""
      width={1024}
      height={1024}
      loading="eager"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/**
 * Renders the brand's actual primary lockup from the Jaylor brand
 * guidelines -- the mannequin/tape/needle "J" fused directly with the
 * "aylor" wordmark as one image, rather than an icon next to a
 * separately-styled text span, so every full "Jaylor" wordmark in the
 * app matches the guide exactly.
 *
 * `dark` (true on the navy premium-public background) uses a solid-gold
 * monochrome rendition of the same lockup -- generated from the same
 * source art by flattening every non-transparent pixel to the guide's
 * gold (#D4AF37), the same treatment the guide's own brand-application
 * photos show (gold foil/embroidery on navy fabric, not the two-tone
 * navy+gold colouring, which would make the mannequin body blend into
 * a navy background).
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
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={dark ? primaryLogoGold : primaryLogo}
        alt="Jaylor"
        width={1376}
        height={768}
        loading="eager"
        className={cn("h-12 w-auto object-contain", markClassName)}
      />
      {showTagline && <span className="sr-only">Crafted for you</span>}
    </span>
  );
}
