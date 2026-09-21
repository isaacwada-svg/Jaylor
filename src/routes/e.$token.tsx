import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE, formatMoney } from "@/lib/jaylor";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";
import { getJobExtras, setParticipantSize } from "@/lib/jobs.functions";

export const Route = createFileRoute("/e/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Your event order — Jaylor" },
      {
        name: "description",
        content: "Measure, choose your style and pay your share for this group order.",
      },
      { property: "og:title", content: "Your event order — Jaylor" },
      {
        property: "og:description",
        content: "Measure, choose your style and pay your share for this group order.",
      },
    ],
  }),
  component: GuestEventPage,
});

const STATUS_STEPS = [
  "Invited",
  "Measured",
  "Paid deposit",
  "Paid full",
  "In production",
  "Ready",
  "Collected",
];
const STATUS_KEYS = [
  "invited",
  "measured",
  "paid_deposit",
  "paid_full",
  "in_production",
  "ready",
  "collected",
];

type StyleOption = { key: string; label: string; price: number | null };

type GuestData = {
  participant: {
    id: string;
    full_name: string;
    style_key: string | null;
    measurement_choice: string | null;
    status: string;
    paid_amount: number;
  };
  event: {
    name: string;
    event_date: string | null;
    organiser_name: string | null;
    fabric_description: string | null;
    styles: StyleOption[];
    price_per_person: number | null;
    deposit_amount: number | null;
    measurement_deadline: string | null;
    delivery_date: string | null;
    store_whatsapp: string | null;
    store_name: string;
  };
};

function GuestEventPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showMeasureFallback, setShowMeasureFallback] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["guest-participant", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_participant_by_token", { p_token: token });
      if (error) throw error;
      return data as unknown as GuestData | null;
    },
  });

  const { data: extras } = useQuery({
    queryKey: ["job-extras", token],
    queryFn: () => getJobExtras({ data: { token } }),
  });

  async function refetch() {
    await queryClient.invalidateQueries({ queryKey: ["guest-participant", token] });
    await queryClient.invalidateQueries({ queryKey: ["job-extras", token] });
  }

  async function chooseSize(sizeKey: string) {
    setBusy(true);
    try {
      await setParticipantSize({ data: { token, sizeKey } });
      await refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your size"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseStyle(styleKey: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_participant_style", {
        p_token: token,
        p_style_key: styleKey,
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your style"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseMeasurement(choice: "self" | "book") {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_participant_measurement_choice", {
        p_token: token,
        p_choice: choice,
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your choice"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <main className="linen min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <h1 className="text-xl">We couldn&apos;t find your invite</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Double-check the link the organiser shared with you.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Go to Jaylor</Link>
        </Button>
      </main>
    );
  }

  const { participant, event } = data;
  const statusIndex = Math.max(0, STATUS_KEYS.indexOf(participant.status));
  const whatsappTarget = event.store_whatsapp;
  const selectedStyle = event.styles.find((s) => s.key === participant.style_key);
  const tierPrice = extras?.pricingMode === "quantity_tiers" ? extras.currentTierPrice : null;
  const amountDue = selectedStyle?.price ?? tierPrice ?? event.price_per_person ?? null;
  const usesSizeChart =
    !!extras && extras.collectionMode === "sizes" && extras.sizeChart.length > 0;
  const sponsored = !!extras && extras.payerMode !== "each_pays" && extras.isSponsored;

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold">{event.store_name}</p>
          <h1 className="mt-2 font-heading text-2xl">{event.name}</h1>
          {event.event_date && (
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(event.event_date).toLocaleDateString()}
            </p>
          )}
          {event.organiser_name && (
            <p className="mt-1 text-xs text-muted-foreground">
              Organised by {event.organiser_name}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm">
            Hi {participant.full_name.split(" ")[0]}, welcome to the group order.
          </p>
          {event.fabric_description && (
            <p className="mt-2 text-sm text-muted-foreground">{event.fabric_description}</p>
          )}

          <StitchDivider className="my-5" />

          <StitchTrack steps={STATUS_STEPS} currentIndex={statusIndex} compact />

          <StitchDivider className="my-5" />

          <div>
            <p className="text-sm font-medium">Choose your style</p>
            <div className="mt-2 space-y-2">
              {event.styles.map((style) => (
                <button
                  key={style.key}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseStyle(style.key)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    participant.style_key === style.key
                      ? "border-gold bg-accent"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-foreground">{style.label}</span>
                  {style.price != null && <span>{formatMoney(style.price)}</span>}
                </button>
              ))}
            </div>
          </div>

          <StitchDivider className="my-5" />

          {extras && usesSizeChart && !showMeasureFallback ? (
            <div>
              <p className="text-sm font-medium">Choose your size</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {extras.sizeChart.map((size) => (
                  <button
                    key={size.key}
                    type="button"
                    disabled={busy}
                    onClick={() => chooseSize(size.key)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      extras.sizeKey === size.key
                        ? "border-gold bg-accent"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <span className="block text-foreground">{size.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      Chest {size.chest} · Waist {size.waist} · Length {size.length}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowMeasureFallback(true)}
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                My size isn&apos;t listed — take my measurements instead
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Your measurements</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => chooseMeasurement("self")}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    participant.measurement_choice === "self"
                      ? "border-gold bg-accent"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  I&apos;ll come in to be measured
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => chooseMeasurement("book")}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    participant.measurement_choice === "book"
                      ? "border-gold bg-accent"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  I&apos;ve already sent my measurements
                </button>
              </div>
            </div>
          )}

          <StitchDivider className="my-5" />

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="figures font-medium">
                {amountDue != null ? formatMoney(amountDue) : "To be confirmed"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid so far</span>
              <span className="figures text-paid">{formatMoney(participant.paid_amount)}</span>
            </div>
            {sponsored ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Your organiser is covering this order — no payment needed from you.
              </p>
            ) : whatsappTarget ? (
              <Button asChild className="mt-3 w-full">
                <a
                  href={whatsappLink(
                    whatsappTarget,
                    `Hi, I'm ${participant.full_name} for ${event.name}. I'd like to pay my deposit.`,
                  )}
                >
                  <MessageCircle className="size-4" />
                  Message us to pay
                </a>
              </Button>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Online payment isn&apos;t set up yet. The organiser will collect your deposit.
              </p>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
