import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
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

export const Route = createFileRoute("/$handle")({
  head: () => ({
    meta: [{ title: "Shop — Jaylor" }],
  }),
  component: PublicStorefront,
});

type ItemRow = Tables<"storefront_items">;

function priceLabel(item: ItemRow): string {
  if (item.price_min && item.price_max && item.price_max !== item.price_min) {
    return `${formatMoney(item.price_min)} – ${formatMoney(item.price_max)}`;
  }
  if (item.price_min) return `From ${formatMoney(item.price_min)}`;
  return "Price on request";
}

function PublicStorefront() {
  const { handle } = Route.useParams();
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
        <h1 className="text-xl">We couldn&apos;t find that shop</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Double-check the link your tailor shared with you.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Go to Jaylor</Link>
        </Button>
      </main>
    );
  }

  const whatsappNumber = store.whatsapp_phone;

  return (
    <main className="linen min-h-screen bg-background">
      <div
        className="flex h-40 items-end bg-gradient-to-br from-primary to-primary/70 lg:h-56"
        style={
          store.cover_url
            ? {
                backgroundImage: `url(${store.cover_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 lg:px-8">
        <div className="-mt-10 flex items-end gap-4">
          <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-background bg-card font-heading text-2xl shadow-sm">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="size-full rounded-2xl object-cover" />
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
                Message on WhatsApp
              </a>
            </Button>
          )}
          <AiDesignGenerator
            storeId={store.id ?? ""}
            storeName={store.name ?? ""}
            whatsappNumber={whatsappNumber}
          />
        </div>

        <StitchDivider className="my-8" />

        {itemsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This shop hasn&apos;t published any styles yet.
          </p>
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
                  {item.photos[0] ? (
                    <img
                      src={item.photos[0]}
                      alt={item.title}
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center bg-accent text-sm text-muted-foreground">
                      No photo yet
                    </div>
                  )}
                  <CardContent className="p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{priceLabel(item)}</p>
                    {item.turnaround_days && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ready in about {item.turnaround_days} days
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
                        src={photo}
                        alt={selectedItem.title}
                        className="h-40 w-32 rounded-xl object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-sm font-medium">{priceLabel(selectedItem)}</p>
              {selectedItem.turnaround_days && (
                <p className="text-sm text-muted-foreground">
                  Ready in about {selectedItem.turnaround_days} days
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
                    Order on WhatsApp
                  </a>
                </Button>
              ) : (
                <Button className="w-full" onClick={() => setSewFormOpen(true)}>
                  Sew this for me
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
          photos={selectedItem.photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </main>
  );
}
