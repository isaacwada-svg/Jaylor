import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StorefrontItemForm } from "@/components/jaylor/storefront-item-form";
import { OrderForm } from "@/components/jaylor/order-form";
import { FeatureLimitSheet } from "@/components/jaylor/feature-limit-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useStore } from "@/lib/store-context";
import { effectiveTier, formatMoney } from "@/lib/jaylor";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/shop")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Shop — Jaylor" },
      {
        name: "description",
        content:
          "Your own storefront: show styles, take deposits and let clients order straight from WhatsApp.",
      },
      { property: "og:title", content: "Shop — Jaylor" },
      {
        property: "og:description",
        content: "Show your styles, take deposits and receive orders from WhatsApp.",
      },
    ],
  }),
  component: Shop,
});

type ItemRow = Tables<"storefront_items">;
type SewRequestRow = Tables<"sew_requests">;
type ClientRow = Tables<"clients">;

const FREE_ITEM_LIMIT = 10;

function Shop() {
  const { currentStore, currentRole, refetch: refetchStore } = useStore();
  const storeId = currentStore?.id;
  const canManage = currentRole === "owner" || currentRole === "manager";
  const queryClient = useQueryClient();

  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [limitSheetOpen, setLimitSheetOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [orderClient, setOrderClient] = useState<ClientRow | null>(null);

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["storefront-items", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_items")
        .select("*")
        .eq("store_id", storeId as string)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["sew-requests", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sew_requests")
        .select("*")
        .eq("store_id", storeId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const newRequests = (requests ?? []).filter((r) => r.status === "new");
  const tier = effectiveTier(currentStore);
  const atFreeLimit = tier === "Free" && (items?.length ?? 0) >= FREE_ITEM_LIMIT;

  function invalidateItems() {
    queryClient.invalidateQueries({ queryKey: ["storefront-items", storeId] });
  }
  function invalidateRequests() {
    queryClient.invalidateQueries({ queryKey: ["sew-requests", storeId] });
  }

  function openNewItem() {
    if (atFreeLimit) {
      setLimitSheetOpen(true);
      return;
    }
    setEditingItem(null);
    setItemFormOpen(true);
  }

  async function togglePublished(item: ItemRow) {
    try {
      const { error } = await supabase
        .from("storefront_items")
        .update({ published: !item.published })
        .eq("id", item.id);
      if (error) throw error;
      invalidateItems();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this item"));
    }
  }

  async function deleteItem(item: ItemRow) {
    try {
      const { error } = await supabase.from("storefront_items").delete().eq("id", item.id);
      if (error) throw error;
      toast.success("Item removed");
      invalidateItems();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this item"));
    }
  }

  async function moveItem(item: ItemRow, direction: "up" | "down") {
    if (!items) return;
    const index = items.findIndex((i) => i.id === item.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const swapItem = items[swapIndex];
    if (!swapItem) return;
    try {
      await Promise.all([
        supabase
          .from("storefront_items")
          .update({ sort_order: swapItem.sort_order })
          .eq("id", item.id),
        supabase
          .from("storefront_items")
          .update({ sort_order: item.sort_order })
          .eq("id", swapItem.id),
      ]);
      invalidateItems();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not reorder items"));
    }
  }

  async function declineRequest(request: SewRequestRow) {
    try {
      const { error } = await supabase
        .from("sew_requests")
        .update({ status: "declined" })
        .eq("id", request.id);
      if (error) throw error;
      invalidateRequests();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this request"));
    }
  }

  async function convertRequest(request: SewRequestRow) {
    if (!storeId) return;
    try {
      await supabase.from("sew_requests").update({ status: "contacted" }).eq("id", request.id);
      invalidateRequests();

      const { data: existing } = await supabase
        .from("clients")
        .select("*")
        .eq("store_id", storeId)
        .eq("phone", request.phone)
        .maybeSingle();

      if (existing) {
        setOrderClient(existing);
      } else {
        const { data: created, error: createError } = await supabase
          .from("clients")
          .insert({ store_id: storeId, full_name: request.client_name, phone: request.phone })
          .select()
          .single();
        if (createError) throw createError;
        setOrderClient(created);
      }
      setOrderFormOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not start this order"));
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Shop</h1>
          {currentStore && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/$handle" params={{ handle: currentStore.slug }} target="_blank">
                <ExternalLink className="size-4" />
                View shop
              </Link>
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="requests">
              Requests{newRequests.length > 0 ? ` (${newRequests.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="profile">Shop profile</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-6">
            <div className="flex justify-end">
              {canManage && (
                <Button onClick={openNewItem}>
                  <Plus className="size-4" />
                  Add item
                </Button>
              )}
            </div>
            {itemsLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : !items || items.length === 0 ? (
              <EmptyState
                className="mt-6"
                title="Your storefront is waiting"
                description="Add your first style with a photo and price, and share one beautiful link."
                action={canManage ? <Button onClick={openNewItem}>Add a style</Button> : undefined}
              />
            ) : (
              <div className="mt-4 space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {item.photos[0] ? (
                          <img
                            src={item.photos[0]}
                            alt={item.title}
                            className="size-14 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="size-14 shrink-0 rounded-xl bg-accent" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {item.price_min
                              ? `From ${formatMoney(item.price_min)}`
                              : "No price set"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={item.published ? "border-paid text-paid" : ""}
                      >
                        {item.published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    {canManage && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingItem(item);
                            setItemFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => togglePublished(item)}>
                          {item.published ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={index === 0}
                          onClick={() => moveItem(item, "up")}
                          aria-label="Move up"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={index === items.length - 1}
                          onClick={() => moveItem(item, "down")}
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteItem(item)}
                          aria-label="Delete item"
                        >
                          <Trash2 className="size-4 text-owed" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-6">
            {!requests || requests.length === 0 ? (
              <EmptyState
                title="No requests yet"
                description="When someone taps 'Sew this for me' on your shop page, it shows up here."
              />
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{request.client_name}</p>
                        <p className="figures text-sm text-muted-foreground">
                          {formatPhoneNG(request.phone)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {request.fabric_source === "customer"
                            ? "Has their own fabric"
                            : "Needs fabric bought"}{" "}
                          ·{" "}
                          {request.measurement_choice === "book"
                            ? "Wants to book a measurement"
                            : "Will measure themselves"}
                        </p>
                        {request.notes && (
                          <p className="mt-2 text-sm text-muted-foreground">{request.notes}</p>
                        )}
                      </div>
                      <Badge variant="outline">{request.status}</Badge>
                    </div>
                    {canManage && request.status === "new" && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => convertRequest(request)}>
                          Convert to order
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => declineRequest(request)}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile" className="mt-6">
            {currentStore && <ShopProfileForm storeId={currentStore.id} onSaved={refetchStore} />}
          </TabsContent>
        </Tabs>
      </div>

      {storeId && (
        <StorefrontItemForm
          open={itemFormOpen}
          onOpenChange={setItemFormOpen}
          storeId={storeId}
          item={editingItem}
          nextSortOrder={(items?.length ?? 0) + 1}
          onSaved={invalidateItems}
        />
      )}

      {storeId && (
        <FeatureLimitSheet
          open={limitSheetOpen}
          onOpenChange={setLimitSheetOpen}
          requiredTier="Growth"
          message={`You've reached the ${FREE_ITEM_LIMIT}-item limit on Free. Growth gives you an unlimited shop.`}
        />
      )}

      {storeId && (
        <OrderForm
          open={orderFormOpen}
          onOpenChange={setOrderFormOpen}
          storeId={storeId}
          initialClient={orderClient}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["orders", storeId] })}
        />
      )}
    </AppShell>
  );
}

function ShopProfileForm({ storeId, onSaved }: { storeId: string; onSaved: () => void }) {
  const { currentStore } = useStore();
  const [bio, setBio] = useState(currentStore?.bio ?? "");
  const [whatsappPhone, setWhatsappPhone] = useState(currentStore?.whatsapp_phone ?? "");
  const [openingHours, setOpeningHours] = useState(currentStore?.opening_hours ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          bio: bio.trim() || null,
          whatsapp_phone: whatsappPhone.trim() || null,
          opening_hours: openingHours.trim() || null,
        })
        .eq("id", storeId);
      if (error) throw error;
      toast.success("Shop profile updated");
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your shop profile"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shop-bio">About your shop</Label>
        <Textarea
          id="shop-bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Bespoke agbada and ankara wear, made to measure in Abuja."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shop-whatsapp">WhatsApp number</Label>
        <Input
          id="shop-whatsapp"
          value={whatsappPhone}
          onChange={(e) => setWhatsappPhone(e.target.value)}
          placeholder="+234 800 000 0000"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shop-hours">Opening hours</Label>
        <Input
          id="shop-hours"
          value={openingHours}
          onChange={(e) => setOpeningHours(e.target.value)}
          placeholder="Mon–Sat, 9am–6pm"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
