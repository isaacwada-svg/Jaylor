import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE } from "@/lib/jaylor";
import { useOnlineStatus } from "@/lib/use-online-status";
import { whatsappLink } from "@/lib/whatsapp";
import {
  bookFittingViaLink,
  getFittingLinkDetails,
  rescheduleFittingViaLink,
} from "@/lib/fitting-links.functions";
import { getErrorMessage } from "@/lib/utils";
import { groupFittingSlotsByDay, formatFittingSlotTime } from "@/lib/fitting-slots";

export const Route = createFileRoute("/f/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Book your fitting — Jaylor" },
      { name: "description", content: "Pick a time for your fitting appointment." },
    ],
  }),
  component: FittingBookingPage,
});

const PURPOSE_LABELS: Record<string, string> = {
  fitting: "Fitting",
  final_fitting: "Final fitting",
};

function FittingBookingPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const { data: view, isLoading } = useQuery({
    queryKey: ["fitting-link", token],
    queryFn: () => getFittingLinkDetails({ data: { token } }),
  });

  async function handleBook() {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      const result = await bookFittingViaLink({ data: { token, startsAt: selectedSlot } });
      if (!result.ok) {
        toast.error(result.error ?? "Could not book this slot. Please pick another.");
        await queryClient.invalidateQueries({ queryKey: ["fitting-link", token] });
        setSelectedSlot(null);
        return;
      }
      toast.success("Fitting booked");
      setSelectedSlot(null);
      await queryClient.invalidateQueries({ queryKey: ["fitting-link", token] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not book this slot"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule() {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      const result = await rescheduleFittingViaLink({
        data: { token, newStartsAt: selectedSlot },
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not reschedule to this slot. Please pick another.");
        await queryClient.invalidateQueries({ queryKey: ["fitting-link", token] });
        setSelectedSlot(null);
        return;
      }
      toast.success("Fitting rescheduled");
      setSelectedSlot(null);
      setRescheduling(false);
      await queryClient.invalidateQueries({ queryKey: ["fitting-link", token] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not reschedule this fitting"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <main className="linen min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-md space-y-4">
          <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
            <BrandLogo markClassName="h-12 w-auto" />
          </Link>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </main>
    );
  }

  const whatsappButton = view?.storeWhatsapp ? (
    <Button asChild variant="outline" className="mt-4 w-full">
      <a
        href={whatsappLink(view.storeWhatsapp, `Hi, I need help booking my fitting.`)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="size-4" />
        Message {view.storeName ?? "the shop"} on WhatsApp
      </a>
    </Button>
  ) : null;

  const friendlyMessage = (title: string, description: string) => (
    <div className="py-4 text-center">
      <h1 className="text-xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {whatsappButton}
    </div>
  );

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          {!view || view.status === "not_found" ? (
            friendlyMessage(
              "We couldn't find this link",
              "Double-check the link your tailor shared with you.",
            )
          ) : view.status === "order_closed" ? (
            friendlyMessage(
              "This order is no longer open for fittings",
              "If you think this is a mistake, reach out to the shop below.",
            )
          ) : view.status === "expired" ? (
            friendlyMessage("This booking link has expired", "Ask the shop to send you a new one.")
          ) : view.status === "used" ? (
            friendlyMessage(
              "This booking link has already been used",
              "If you need to change your appointment, reach out to the shop below.",
            )
          ) : !online ? (
            <div className="py-4">
              <h1 className="text-xl">
                Book your {PURPOSE_LABELS[view.purpose ?? ""] ?? "fitting"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{view.storeName}</p>
              <div className="mt-4">
                <OfflineNotice label="Connect to the internet to book a fitting." />
              </div>
            </div>
          ) : view.status === "booked_reschedulable" ? (
            <div>
              <h1 className="text-xl">Your fitting is booked</h1>
              <p className="mt-1 text-sm text-muted-foreground">{view.storeName}</p>
              {view.garmentType && (
                <p className="mt-3 text-sm">
                  {view.garmentType} · {PURPOSE_LABELS[view.purpose ?? ""] ?? "Fitting"}
                </p>
              )}
              {view.startsAt && (
                <p className="mt-1 text-sm font-medium">
                  {new Date(view.startsAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  at {formatFittingSlotTime(view.startsAt)}
                </p>
              )}
              {!rescheduling ? (
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => setRescheduling(true)}
                >
                  Reschedule
                </Button>
              ) : (
                <div className="mt-4 space-y-4">
                  <SlotPicker
                    slots={view.availableSlots}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setRescheduling(false);
                        setSelectedSlot(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!selectedSlot || busy}
                      onClick={handleReschedule}
                    >
                      {busy ? "Saving..." : "Confirm new time"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h1 className="text-xl">
                Book your {PURPOSE_LABELS[view.purpose ?? ""] ?? "fitting"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{view.storeName}</p>
              {view.garmentType && (
                <p className="mt-3 text-sm">
                  {view.garmentType}
                  {view.quantity ? ` × ${view.quantity}` : ""}
                </p>
              )}
              <div className="mt-4">
                <SlotPicker
                  slots={view.availableSlots}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                />
              </div>
              <Button className="mt-4 w-full" disabled={!selectedSlot || busy} onClick={handleBook}>
                {busy ? "Booking..." : "Confirm booking"}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}

function SlotPicker({
  slots,
  selected,
  onSelect,
}: {
  slots: string[];
  selected: string | null;
  onSelect: (slot: string) => void;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
        No open times in the next two weeks. Please message the shop directly.
      </p>
    );
  }

  const groups = groupFittingSlotsByDay(slots);

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.day}>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{group.day}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {group.times.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelect(slot)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  selected === slot
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border hover:bg-accent/60"
                }`}
              >
                {formatFittingSlotTime(slot)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
