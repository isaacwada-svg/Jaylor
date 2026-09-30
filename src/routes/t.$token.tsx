import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, ImageIcon, CalendarClock } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE, formatMoney, ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";
import { getOrderTracking } from "@/lib/order-tracking.functions";
import { getFunctionErrorMessage } from "@/lib/utils";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/t/$token")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const order = await getOrderTracking({ data: { token: params.token } });
    const language = await resolveLanguage({
      data: {
        urlLang: deps.lang,
        clientPreferredLanguage: order?.clientPreferredLanguage,
        storeLanguage: order?.storeLanguage,
      },
    });
    const resources = await loadNamespaces(language, ["common", "tracking"]);
    return { order, language, resources };
  },
  head: () => ({
    meta: [
      { title: "Track your order — Jaylor" },
      {
        name: "description",
        content: "Follow your order's progress and pay any balance owed.",
      },
    ],
  }),
  component: OrderTrackingRoute,
});

function OrderTrackingRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <OrderTrackingPage />
    </I18nProvider>
  );
}

function OrderTrackingPage() {
  const { token } = Route.useParams();
  const { order: initialOrder } = Route.useLoaderData();
  const tc = useT("common");
  const t = useT("tracking");
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-tracking", token],
    queryFn: () => getOrderTracking({ data: { token } }),
    initialData: initialOrder,
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
          toast.success(t("payment_confirmed"));
          queryClient.invalidateQueries({ queryKey: ["order-tracking", token] });
        } else {
          toast.error(t("payment_not_confirmed"));
        }
      } catch (error) {
        toast.error(await getFunctionErrorMessage(error, t("could_not_confirm_payment")));
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
      toast.error(await getFunctionErrorMessage(error, t("could_not_start_payment")));
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
        <h1 className="mt-8 text-xl">{t("order_not_found_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tc("not_found_description")}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">{tc("go_home")}</Link>
        </Button>
      </main>
    );
  }

  const statusIndex = ORDER_STATUSES_DB.indexOf(order.status as (typeof ORDER_STATUSES_DB)[number]);
  const timelinePhotos = order.timeline
    .map((entry) => entry.photo_url)
    .filter((p): p is string => !!p);

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <span />
          <LanguageSwitcher />
        </div>
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
              {t("delivery_date", { date: new Date(order.deliveryDate).toLocaleDateString() })}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
          {order.status === "cancelled" ? (
            <p className="text-center text-sm text-owed">{t("cancelled")}</p>
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
                      : `${t("created_as_prefix")} `}
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
                {t("no_updates")}
              </p>
            )}
          </div>

          {order.nextFitting && (
            <>
              <StitchDivider className="my-5" />
              <div className="flex items-center gap-2 rounded-xl border border-gold/40 bg-accent/30 p-3 text-sm">
                <CalendarClock className="size-4 shrink-0 text-gold" />
                <span>
                  {t("next_fitting", {
                    date: new Date(order.nextFitting.startsAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    }),
                    time: new Date(order.nextFitting.startsAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  })}
                </span>
              </div>
            </>
          )}

          <StitchDivider className="my-5" />

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("paid_so_far")}</span>
              <span className="figures text-paid">{formatMoney(order.paid)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("balance")}</span>
              <span className="figures text-owed">{formatMoney(order.balance)}</span>
            </div>

            {order.balance > 0 && (
              <div className="mt-3 space-y-2">
                {order.dedicatedAccount && (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm">
                    <p className="text-xs text-muted-foreground">{t("pay_by_transfer")}</p>
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
                    {paying
                      ? t("starting_payment")
                      : t("pay_amount", { amount: formatMoney(order.balance) })}
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
