import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, QrCode, Share2, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COMPANY_LINE } from "@/lib/jaylor";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";
import {
  getPassportByToken,
  requestPassportUpdate,
  revokePassportByClient,
  sharePassportWithStore,
} from "@/lib/passport.functions";

export const Route = createFileRoute("/passport/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Measurement card — Jaylor" },
      {
        name: "description",
        content: "A client's private measurement card, issued by their tailor on Jaylor.",
      },
      { property: "og:title", content: "Measurement card — Jaylor" },
      {
        property: "og:description",
        content: "A client's private measurement card, issued by their tailor on Jaylor.",
      },
    ],
  }),
  component: PassportPage,
});

function PassportPage() {
  const { token } = Route.useParams();
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const { data: passport, isLoading } = useQuery({
    queryKey: ["passport-by-token", token],
    queryFn: () => getPassportByToken({ data: { token } }),
  });

  useEffect(() => {
    if (!passport || passport.status !== "active") return;
    QRCode.toDataURL(window.location.href, { margin: 1, width: 240 })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [passport]);

  async function handleRequestUpdate() {
    try {
      const result = await requestPassportUpdate({ data: { token } });
      if (result.storeWhatsapp) {
        window.open(
          whatsappLink(
            result.storeWhatsapp,
            `Hi ${result.storeName}, please could you update my measurements on Jaylor? Thank you.`,
          ),
          "_blank",
          "noopener,noreferrer",
        );
      }
      toast.success("Update requested. Your tailor has been notified");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send this request"));
    }
  }

  async function handleRevoke() {
    if (
      !window.confirm(
        "Turn off this measurement card? Anyone with the old link will no longer see it.",
      )
    ) {
      return;
    }
    try {
      await revokePassportByClient({ data: { token } });
      toast.success("Your measurement card has been turned off");
      window.location.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not turn off this card"));
    }
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo showTagline markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 space-y-4">
          {isLoading ? (
            <Skeleton className="h-80 rounded-2xl" />
          ) : !passport ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <h1 className="text-xl">We couldn&apos;t find that card</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The link may be wrong, or this card was turned off.
              </p>
            </div>
          ) : passport.status === "revoked" ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <ShieldOff className="mx-auto size-8 text-muted-foreground" />
              <h1 className="mt-3 text-xl">This card is no longer active</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask {passport.storeName || "your tailor"} to send you a new one.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-card p-6">
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Measurement card
                </p>
                <h1 className="mt-1 text-xl">{passport.clientFirstName}&apos;s measurements</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Issued by {passport.storeName || "a Jaylor shop"}
                  {passport.takenAt &&
                    ` · taken ${new Date(passport.takenAt).toLocaleDateString()}`}
                </p>

                {passport.fields.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {passport.fields.map((f) => (
                      <div key={f.label} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="figures">{f.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No measurements have been recorded yet.
                  </p>
                )}
                {passport.notes && (
                  <p className="mt-3 text-sm text-muted-foreground">{passport.notes}</p>
                )}
              </div>

              {qrDataUrl && (
                <div className="rounded-2xl border bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">Show this to a new tailor to scan</p>
                  <img
                    src={qrDataUrl}
                    alt="QR code for this measurement card"
                    className="mx-auto mt-3 size-40"
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Button variant="outline" onClick={handleRequestUpdate}>
                  <MessageCircle className="size-4" />
                  Request an update
                </Button>
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <QrCode className="size-4" />
                  Share with another shop
                </Button>
                <Button variant="ghost" className="text-owed" onClick={handleRevoke}>
                  <ShieldOff className="size-4" />
                  Turn off this card
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} token={token} />
    </main>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
}) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const cleaned = slug
        .trim()
        .replace(/^https?:\/\/[^/]+\//, "")
        .replace(/\/+$/, "");
      const result = await sharePassportWithStore({
        data: { token, targetStoreSlug: cleaned },
      });
      if (result.ok) {
        toast.success(`Sent to ${result.storeName}. They'll review it and let you know.`);
        onOpenChange(false);
        setSlug("");
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send this request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with another shop</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-slug">The shop&apos;s Jaylor link</Label>
            <Input
              id="target-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. adastitches"
              required
            />
            <p className="text-xs text-muted-foreground">
              Ask the new shop for the last part of their Jaylor storefront link.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !slug.trim()} className="w-full">
              <Share2 className="size-4" />
              {busy ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
