import { Facebook, Instagram, Linkedin, Mail } from "lucide-react";
import { SOCIAL_LINKS, SUPPORT_EMAIL } from "@/lib/jaylor";

const SOCIAL_ICONS = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
} as const;

/**
 * Jaylor's own social profiles, read from SOCIAL_LINKS so every public page
 * shows the same three addresses. Pass showHandles to spell the network names
 * out next to the icons; without it the names stay as accessible labels.
 */
export function SocialLinks({
  className,
  showHandles = false,
}: {
  className?: string;
  showHandles?: boolean;
}) {
  return (
    <div className={className}>
      {SOCIAL_LINKS.map(({ key, label, handle, url }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label}: ${handle}`}
            title={`${label}: ${handle}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-gold"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {showHandles && <span>{label}</span>}
          </a>
        );
      })}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        aria-label={`Email: ${SUPPORT_EMAIL}`}
        title={`Email: ${SUPPORT_EMAIL}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-gold"
      >
        <Mail aria-hidden="true" className="size-4 shrink-0" />
        {showHandles && <span>Email</span>}
      </a>
    </div>
  );
}
