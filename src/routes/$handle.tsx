import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { SewRequestForm } from "@/components/jaylor/sew-request-form";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";
import { AiDesignGenerator } from "@/components/jaylor/ai-design-generator";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { COMPANY_LINE, formatMoney } from "@/lib/jaylor";
import { whatsappLink } from "@/lib/whatsapp";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/$handle")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: storeLanguage } = await supabase.rpc("get_store_language_by_slug", {
      p_slug: params.handle,
    });
    const language = await resolveLanguage({ data: { urlLang: deps.lang, storeLanguage } });
    const resources = await loadNamespaces(language, ["common", "storefront"]);
    return { language, resources };
  },
  head: () => ({
    meta: [
      { title: "Shop: Jaylor" },
      {
        name: "description",
        content: "Browse styles and get in touch on WhatsApp, powered by Jaylor.",
      },
      { property: "og:title", content: "Shop: Jaylor" },
      {
        property: "og:description",
        content: "Browse styles and get in touch on WhatsApp, powered by Jaylor.",
      },
    ],
  }),
  component: PublicStorefrontRoute,
});

function PublicStorefrontRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <PublicStorefront />
    </I18nProvider>
  );
}

type ItemRow = Tables<"storefront_items">;

function priceLabel(
  item: ItemRow,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (item.price_min && item.price_max && item.price_max !== item.price_min) {
    return `${formatMoney(item.price_min)} – ${formatMoney(item.price_max)}`;
  }
  if (item.price_min) return t("price_from", { price: formatMoney(item.price_min) });
  return t("price_on_request");
}

function PublicStorefront() {
  const { handle } = Route.useParams();
  const t = useT("storefront");
  const tc = useT("common");
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [sewFormOpen, setSewFormOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const {
    data: store,
    isLoading: storeLoading,
    error: storeError,
  } = useQuery({
    queryKey: ["stores-public", handle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores_public")
        .select("*")
        .eq("slug", handle)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: payoutAccount } = useQuery({
    queryKey: ["storefront-payout-account", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_storefront_payout_account", {
        p_store_id: store?.id as string,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: onTimeBadge } = useQuery({
    queryKey: ["storefront-on-time-badge", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_storefront_on_time_badge", {
        p_store_id: store?.id as string,
      });
      if (error) throw error;
      return data as unknown as { rate: number; orders_counted: number } | null;
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["storefront-public-items", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_items")
        .select("*")
        .eq("store_id", store?.id as string)
        .eq("published", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const photoUrl = useStorefrontPhotoUrls([
    ...(items?.flatMap((item) => item.photos) ?? []),
    store?.logo_url ?? null,
    store?.cover_url ?? null,
  ]);

  if (storeLoading) {
    return (
      <main className="linen min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (storeError || !store) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <h1 className="text-xl">{t("shop_not_found_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tc("not_found_description")}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">{tc("go_home")}</Link>
        </Button>
      </main>
    );
  }

  const whatsappNumber = store.whatsapp_phone;

  return (
    <main className="linen min-h-screen bg-background">
      <div className="flex justify-end px-4 pt-4">
        <LanguageSwitcher />
      </div>
      <div
        className="flex h-40 items-end bg-gradient-to-br from-primary to-primary/70 lg:h-56"
        style={
          store.cover_url && photoUrl(store.cover_url)
            ? {
                backgroundImage: `url(${photoUrl(store.cover_url)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 lg:px-8">
        <div className="-mt-10 flex items-end gap-4">
          <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-background bg-card font-heading text-2xl shadow-sm">
            {store.logo_url && photoUrl(store.logo_url) ? (
              <img
                src={photoUrl(store.logo_url)}
                alt=""
                className="size-full rounded-2xl object-cover"
              />
            ) : (
              (store.name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
        </div>

        <h1 className="mt-4 font-heading text-3xl">{store.name}</h1>
        {store.city && <p className="mt-1 text-sm text-muted-foreground">{store.city}</p>}
        {store.bio && <p className="mt-3 max-w-xl text-sm text-muted-foreground">{store.bio}</p>}
        {store.opening_hours && (
          <p className="mt-1 text-xs text-muted-foreground">{store.opening_hours}</p>
        )}
        {onTimeBadge && (
          <p className="mt-2 inline-flex items-center rounded-full border border-paid/40 bg-paid/10 px-3 py-1 text-xs text-paid">
            {t("on_time_badge", { rate: onTimeBadge.rate, count: onTimeBadge.orders_counted })}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {whatsappNumber && (
            <Button asChild className="mt-4">
              <a
                href={whatsappLink(
                  whatsappNumber,
                  `Hi ${store.name}, I saw your Jaylor shop page.`,
                )}
              >
                <MessageCircle className="size-4" />
                {t("message_whatsapp")}
              </a>
            </Button>
          )}
          <AiDesignGenerator
            storeId={store.id ?? ""}
            storeName={store.name ?? ""}
            whatsappNumber={whatsappNumber}
          />
        </div>

        {payoutAccount && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:max-w-sm">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("pay_by_transfer")}</p>
              <p className="figures font-medium">{payoutAccount.account_number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {payoutAccount.account_name} · {payoutAccount.bank_name}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent"
              onClick={() => {
                navigator.clipboard
                  .writeText(payoutAccount.account_number ?? "")
                  .then(() => toast.success(t("account_copied")))
                  .catch(() => toast.error(t("copy_failed")));
              }}
            >
              <Copy className="size-4" />
            </button>
          </div>
        )}

        <StitchDivider className="my-8" />

        {itemsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_styles_published")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItem(item)}
                className="text-left"
              >
                <Card className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5">
                  {photoUrl(item.photos[0]) ? (
                    <img
                      src={photoUrl(item.photos[0])}
                      alt={item.title}
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center bg-accent text-sm text-muted-foreground">
                      {t("no_photo_yet")}
                    </div>
                  )}
                  <CardContent className="p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{priceLabel(item, t)}</p>
                    {item.turnaround_days && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("ready_in_days", { days: item.turnaround_days })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}

        <p className="mt-12 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedItem.title}</DialogTitle>
                {selectedItem.category && (
                  <DialogDescription>{selectedItem.category}</DialogDescription>
                )}
              </DialogHeader>
              {selectedItem.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {selectedItem.photos.map((photo, i) => (
                    <button
                      key={photo}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="shrink-0"
                    >
                      <img
                        src={photoUrl(photo)}
                        alt={selectedItem.title}
                        className="h-40 w-32 rounded-xl object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-sm font-medium">{priceLabel(selectedItem, t)}</p>
              {selectedItem.turnaround_days && (
                <p className="text-sm text-muted-foreground">
                  {t("ready_in_days", { days: selectedItem.turnaround_days })}
                </p>
              )}
              {selectedItem.description && (
                <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
              )}
              {selectedItem.is_ready_made && whatsappNumber ? (
                <Button asChild className="w-full">
                  <a
                    href={whatsappLink(
                      whatsappNumber,
                      `Hi, I'd like to order "${selectedItem.title}" from your shop.`,
                    )}
                  >
                    <MessageCircle className="size-4" />
                    {t("order_whatsapp")}
                  </a>
                </Button>
              ) : (
                <Button className="w-full" onClick={() => setSewFormOpen(true)}>
                  {t("sew_this_for_me")}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedItem && (
        <SewRequestForm
          open={sewFormOpen}
          onOpenChange={setSewFormOpen}
          storeId={store.id ?? ""}
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
        />
      )}

      {selectedItem && (
        <PhotoLightbox
          photos={selectedItem.photos
            .map((photo) => photoUrl(photo))
            .filter((url): url is string => !!url)}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </main>
  );
}
