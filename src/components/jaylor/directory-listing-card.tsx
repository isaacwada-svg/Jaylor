import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle, ShieldCheck, Sparkles, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DirectoryListing } from "@/lib/directory";
import { whatsappLink, directoryIntroMessage } from "@/lib/whatsapp";
import { getPassportSession } from "@/lib/passport-session";
import { DirectoryReportDialog } from "@/components/jaylor/directory-report-dialog";

export function DirectoryListingCard({
  listing,
  preview = false,
}: {
  listing: DirectoryListing;
  /** Rendered from Settings as a live preview -- no links, no report button. */
  preview?: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const locationLabel = [listing.area, listing.city].filter(Boolean).join(", ");
  const hasWhatsapp = !!listing.whatsapp_phone;

  const shareHref = hasWhatsapp
    ? getPassportSession()
      ? ({
          to: "/passport/me",
          search: {
            shareTo: listing.store_id,
            shareToName: listing.name,
            shareToWhatsapp: listing.whatsapp_phone as string,
          },
        } as const)
      : ({
          to: "/passport/claim",
          search: {
            shareTo: listing.store_id,
            shareToName: listing.name,
            shareToWhatsapp: listing.whatsapp_phone as string,
          },
        } as const)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        {listing.logo_url ? (
          <img
            src={listing.logo_url}
            alt=""
            className="size-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-muted-foreground">
            {listing.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{listing.name}</p>
          {locationLabel && (
            <p className="truncate text-sm text-muted-foreground">{locationLabel}</p>
          )}
        </div>
      </div>

      {(listing.badge || listing.remote_orders) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.badge && (
            <Badge variant="outline" className="border-paid text-paid">
              <ShieldCheck className="mr-1 size-3" />
              On time {listing.badge.rate}% ({listing.badge.orders_counted} orders)
            </Badge>
          )}
          {listing.remote_orders && (
            <Badge variant="outline" className="border-gold text-gold">
              <Sparkles className="mr-1 size-3" />
              Accepts remote orders
            </Badge>
          )}
        </div>
      )}

      {listing.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.specialties.map((s) => (
            <span
              key={s}
              className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {listing.bio && <p className="mt-3 text-sm text-muted-foreground">{listing.bio}</p>}

      {!preview && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/$handle" params={{ handle: listing.slug }}>
                View shop
              </Link>
            </Button>
            {hasWhatsapp && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={whatsappLink(listing.whatsapp_phone as string, directoryIntroMessage())}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" />
                  Chat on WhatsApp
                </a>
              </Button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {shareHref && (
              <Link
                to={shareHref.to}
                search={shareHref.search}
                className="text-xs text-gold underline-offset-2 hover:underline"
              >
                Have a Jaylor Passport? Share it with this tailor
              </Link>
            )}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Flag className="size-3" />
              Report this listing
            </button>
          </div>

          <DirectoryReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            storeId={listing.store_id}
          />
        </>
      )}
    </div>
  );
}
