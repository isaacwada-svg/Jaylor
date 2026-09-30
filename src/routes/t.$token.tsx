import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, ImageIcon, CalendarClock } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE, formatMoney, ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";
import { getOrderTracking } from "@/lib/order-tracking.functions";
import { getFunctionErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/t/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Track your order — Jaylor" },
      {
        name: "description",
        content: "Follow your order's progress and pay any balance owed.",
      },
    ],
  }),
  component: OrderTrackingPage,
});

function OrderTrackingPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-tracking", token],
    queryFn: () => getOrderTracking({ data: { token } }),
  });

  // Returning from a Paystack checkout redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      try {
        const { data, error } = await (
          await import("@/integrations/supabase/client")
        ).supabase.functions.invoke("verify-tracking-payment", {
          body: { token, reference },
        });
        if (error) throw error;
        const status = (data as { status: string }).status;
        if (status === "success") {
          toast.success("Payment confirmed");
          queryClient.invalidateQueries({ queryKey: ["order-tracking", token] });
        } else {
          toast.error("Payment wasn't confirmed");
        }
      } catch (error) {
        toast.error(await getFunctionErrorMessage(error, "Could not confirm this payment"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function payBalance() {
    if (!order) return;
    setPaying(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const callbackUrl = window.location.href.split("?")[0] ?? window.location.href;
      const amount = Number(payAmount) || order.balance;
      const { data, error } = await supabase.functions.invoke("create-tracking-payment", {
        body: { token, amount, callbackUrl },
      });
      if (error) throw error;
      const { authorization_url } = data as { authorization_url: string };
      window.location.href = authorization_url;
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not start payment"));
      setPaying(false);
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
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <Link to="/" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>
        <h1 className="mt-8 text-xl">We couldn&apos;t find this order</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Double-check the link your tailor shared with you.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Go to Jaylor</Link>
        </Button>
      </main>
    );
  }

  const statusIndex = ORDER_STATUSES_DB.indexOf(order.status as (typeof ORDER_STATUSES_DB)[number]);
  const timelinePhotos = order.timeline.map((t) => t.photo_url).filter((p): p is string => !!p);

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 text-center">
          {order.storeLogoUrl && (
            <img
              src={order.storeLogoUrl}
              alt=""
              className="mx-auto mb-3 size-12 rounded-full object-cover"
            />
          )}
          <p className="text-xs uppercase tracking-[0.18em] text-gold">{order.storeName}</p>
          <h1 className="mt-2 font-heading text-2xl">
            {order.garmentType} × {order.quantity}
          </h1>
          {order.deliveryDate && (
            <p className="mt-1 text-sm text-muted-foreground">
              Delivery date: {new Date(order.deliveryDate).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
          {order.status === "cancelled" ? (
            <p className="text-center text-sm text-owed">This order was cancelled.</p>
          ) : (
            <StitchTrack
              steps={ORDER_STATUSES_DB.map(orderStatusLabel)}
              currentIndex={statusIndex}
              compact
            />
          )}

          <StitchDivider className="my-5" />

          <div className="space-y-2">
            {order.timeline.map((entry, i) => (
              <div
                key={`${entry.to_status}-${entry.changed_at}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm"
              >
                <div>
                  <p>
                    {entry.from_status
                      ? `${orderStatusLabel(entry.from_status)} → `
                      : "Created as "}
                    {orderStatusLabel(entry.to_status)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleString()}
                  </p>
                  {entry.note && <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>}
                </div>
                {entry.photo_url && (
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex(timelinePhotos.indexOf(entry.photo_url as string))
                    }
                    className="shrink-0"
                  >
                    <img src={entry.photo_url} alt="" className="size-12 rounded-lg object-cover" />
                  </button>
                )}
              </div>
            ))}
            {order.timeline.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="size-4" />
                No updates yet.
              </p>
            )}
          </div>

          {order.nextFitting && (
            <>
              <StitchDivider className="my-5" />
              <div className="flex items-center gap-2 rounded-xl border border-gold/40 bg-accent/30 p-3 text-sm">
                <CalendarClock className="size-4 shrink-0 text-gold" />
                <span>
                  Next fitting:{" "}
                  {new Date(order.nextFitting.startsAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(order.nextFitting.startsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </>
          )}

          <StitchDivider className="my-5" />

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid so far</span>
              <span className="figures text-paid">{formatMoney(order.paid)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="figures text-owed">{formatMoney(order.balance)}</span>
            </div>

            {order.balance > 0 && (
              <div className="mt-3 space-y-2">
                {order.dedicatedAccount && (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm">
                    <p className="text-xs text-muted-foreground">Pay by transfer to</p>
                    <p className="figures font-medium">{order.dedicatedAccount.accountNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.dedicatedAccount.accountName} · {order.dedicatedAccount.bankName}
                    </p>
                  </div>
                )}
                {order.jaylorPayAvailable && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setPayAmount(String(order.balance));
                      void payBalance();
                    }}
                    disabled={paying}
                  >
                    <CreditCard className="size-4" />
                    {paying ? "Starting payment..." : `Pay ${formatMoney(order.balance)}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <PhotoLightbox
        photos={timelinePhotos}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </main>
  );
}
