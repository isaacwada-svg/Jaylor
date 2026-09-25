import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { MoneyText } from "@/components/jaylor/money-text";
import { PaymentForm } from "@/components/jaylor/payment-form";
import { RemindButton } from "@/components/jaylor/remind-button";
import { AiReplyDraftButton } from "@/components/jaylor/ai-reply-draft-button";
import { RequestPaymentButton } from "@/components/jaylor/request-payment-button";
import { ReceiptDialog } from "@/components/jaylor/receipt-dialog";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useStore } from "@/lib/store-context";
import { formatPhoneNG } from "@/lib/phone";
import { ORDER_STATUSES_DB, orderStatusLabel, type OrderStatusDb } from "@/lib/jaylor";
import { isBridalRemeasureDue } from "@/lib/measurements";
import { orderReadyMessage, balanceDueMessage } from "@/lib/whatsapp";
import { getErrorMessage, getFunctionErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Order — Jaylor" }] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();
  const { currentStore, currentRole } = useStore();
  const canSeeMoney = currentRole === "owner" || currentRole === "manager";

  const [pendingStatus, setPendingStatus] = useState<OrderStatusDb | null>(null);
  const [updating, setUpdating] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // If a client (or the owner testing it) returns from a Paystack payment link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-order-payment", {
          body: { reference },
        });
        if (error) throw error;
        const status = (data as { status: string }).status;
        if (status === "success") {
          toast.success("Payment confirmed");
          queryClient.invalidateQueries({ queryKey: ["order", orderId] });
          queryClient.invalidateQueries({ queryKey: ["order-balance", orderId] });
          queryClient.invalidateQueries({ queryKey: ["order-payments", orderId] });
        } else {
          toast.error("Payment wasn't confirmed");
        }
      } catch (error) {
        toast.error(await getFunctionErrorMessage(error, "Could not confirm this payment"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId, canSeeMoney],
    queryFn: async () => {
      if (canSeeMoney) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("orders_for_tailor")
        .select("*")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: client } = useQuery({
    queryKey: ["order-client", order?.client_id],
    enabled: !!order,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", order?.client_id as string)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: material } = useQuery({
    queryKey: ["order-material", orderId],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_materials")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // orders_for_tailor (the view non-owner/manager roles read from) doesn't carry this column,
  // so read it directly off orders rather than off `order` above.
  const { data: styleRefPaths } = useQuery({
    queryKey: ["order-style-ref-paths", orderId],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("style_reference_photos")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data?.style_reference_photos ?? [];
    },
  });

  // Photos live in a private bucket, so they're viewed through short-lived signed links.
  const { data: styleRefPhotos } = useQuery({
    queryKey: ["order-style-ref-urls", orderId, styleRefPaths?.join(",")],
    enabled: !!styleRefPaths && styleRefPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("order-style-photos")
        .createSignedUrls(styleRefPaths as string[], 3600);
      if (error) throw error;
      return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => !!url);
    },
  });

  const { data: measurementSet } = useQuery({
    queryKey: ["order-measurement-set", order?.measurement_set_id],
    enabled: !!order?.measurement_set_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_sets")
        .select("*")
        .eq("id", order?.measurement_set_id as string)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: balance } = useQuery({
    queryKey: ["order-balance", orderId],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_balances")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["order-payments", orderId],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["order-history", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("*")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: pendingStatus })
        .eq("id", orderId);
      if (error) throw error;
      toast.success(`Marked ${orderStatusLabel(pendingStatus)}`);
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-history", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setPendingStatus(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update the status"));
    } finally {
      setUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="mt-4 h-48 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title="Order not found"
            description="This order may have been deleted, or belongs to a different store."
            action={
              <Button asChild>
                <Link to="/orders">Back to orders</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const price = canSeeMoney ? (order as Tables<"orders">).price : null;
  const statusIndex = ORDER_STATUSES_DB.indexOf(order.status as (typeof ORDER_STATUSES_DB)[number]);
  const measurementValues = (measurementSet?.values ?? {}) as Record<string, number>;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Orders
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.1em] text-gold">{order.number}</p>
            <h1 className="mt-1 text-2xl">{order.garment_type}</h1>
            {client && (
              <Link
                to="/clients/$clientId"
                params={{ clientId: client.id }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {client.full_name} · {formatPhoneNG(client.phone)}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            {order.priority === "rush" && (
              <Badge variant="outline" className="border-owed text-owed">
                Rush
              </Badge>
            )}
            {order.delivery_date && (
              <Badge variant="outline" className="border-gold text-gold">
                Due {new Date(order.delivery_date).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </div>

        {order.garment_type === "Bridal" &&
          measurementSet &&
          order.delivery_date &&
          isBridalRemeasureDue(measurementSet.taken_at, order.delivery_date) && (
            <p className="mt-4 rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm">
              These measurements were taken more than 3 months before the wedding date. A
              bride&apos;s measurements can change — take a fresh set or book another fitting before
              this order goes into production.
            </p>
          )}

        {order.status === "cancelled" ? (
          <Badge variant="outline" className="mt-6 border-owed text-owed">
            Cancelled
          </Badge>
        ) : (
          <div className="mt-8">
            <StitchTrack
              steps={ORDER_STATUSES_DB.map(orderStatusLabel)}
              currentIndex={statusIndex}
              className="cursor-pointer"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {ORDER_STATUSES_DB.map((s, i) => (
                <Button
                  key={s}
                  size="sm"
                  variant={i === statusIndex ? "default" : "outline"}
                  onClick={() => setPendingStatus(s)}
                  disabled={i === statusIndex}
                >
                  {orderStatusLabel(s)}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {canSeeMoney && (
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Price</p>
                  <p className="mt-1 text-lg">
                    <MoneyText amount={price ?? 0} />
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Quantity: {order.quantity}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button size="sm" onClick={() => setPaymentFormOpen(true)}>
                    Record payment
                  </Button>
                  {(balance?.balance ?? 0) > 0 && client && (
                    <RequestPaymentButton
                      orderId={order.id ?? ""}
                      defaultAmount={balance?.balance ?? 0}
                      clientName={client.full_name ?? ""}
                      clientPhone={client.whatsapp_phone ?? client.phone ?? ""}
                    />
                  )}
                  {client && currentStore && (
                    <Button size="sm" variant="outline" onClick={() => setReceiptOpen(true)}>
                      Receipt
                    </Button>
                  )}
                </div>
              </div>
              {balance && (
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <MoneyText amount={balance.paid ?? 0} variant="paid" />
                </div>
              )}
              {balance && (
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <MoneyText
                    amount={balance.balance ?? 0}
                    variant={(balance.balance ?? 0) > 0 ? "owed" : "paid"}
                  />
                </div>
              )}
              {client &&
                currentStore &&
                (order.status === "ready" || (balance?.balance ?? 0) > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <RemindButton
                      storeId={currentStore.id}
                      clientId={client.id}
                      orderId={order.id ?? ""}
                      phone={client.whatsapp_phone ?? client.phone ?? ""}
                      consentWhatsapp={client.consent_whatsapp}
                      template={order.status === "ready" ? "order_ready" : "balance_due"}
                      message={
                        order.status === "ready"
                          ? orderReadyMessage(
                              client.full_name ?? "",
                              order.garment_type ?? "",
                              currentStore.name ?? "",
                              balance?.balance ?? 0,
                            )
                          : balanceDueMessage(
                              client.full_name ?? "",
                              order.garment_type ?? "",
                              currentStore.name ?? "",
                              balance?.balance ?? 0,
                            )
                      }
                      label={
                        order.status === "ready"
                          ? "Remind: ready for pickup"
                          : "Remind: balance due"
                      }
                    />
                    <AiReplyDraftButton
                      storeId={currentStore.id}
                      phone={client.whatsapp_phone ?? client.phone}
                      consentWhatsapp={client.consent_whatsapp}
                      clientName={client.full_name ?? ""}
                      garmentType={order.garment_type ?? ""}
                      orderStatus={orderStatusLabel(order.status ?? "")}
                      balance={balance?.balance ?? 0}
                      deliveryDate={order.delivery_date}
                    />
                  </div>
                )}
            </div>
          )}

          {canSeeMoney && material && (
            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Material</p>
              <p className="mt-1 text-sm">
                {material.source === "customer" ? "Customer's fabric" : "Store-bought fabric"}
              </p>
              <p className="text-sm text-muted-foreground">
                {material.description}
                {material.colour ? ` · ${material.colour}` : ""}
                {material.yards ? ` · ${material.yards} yds` : ""}
              </p>
              {material.source === "tailor" && material.cost > 0 && (
                <p className="mt-1 text-sm">
                  Cost: <MoneyText amount={material.cost} />
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-border p-4 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Measurements used
            </p>
            {measurementSet ? (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.entries(measurementValues).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
                    <span className="figures">
                      {value}
                      {measurementSet.unit}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No measurement set attached. Add one from the client&apos;s profile.
              </p>
            )}
          </div>

          {order.style_notes && (
            <div className="rounded-2xl border border-border p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Style notes
              </p>
              <p className="mt-1 text-sm">{order.style_notes}</p>
            </div>
          )}

          {canSeeMoney && styleRefPhotos && styleRefPhotos.length > 0 && (
            <div className="rounded-2xl border border-border p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Reference photos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {styleRefPhotos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="cursor-zoom-in"
                  >
                    <img src={url} alt="" className="size-16 rounded-lg object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {canSeeMoney && payments && payments.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Payments</p>
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                >
                  <div>
                    <MoneyText amount={p.amount} variant={p.voided ? "muted" : "paid"} />
                    <span className="ml-2 text-muted-foreground">
                      {p.method}
                      {p.voided ? " · voided" : ""}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(p.paid_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {history && history.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-sm font-medium text-muted-foreground">History</p>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                >
                  <span>
                    {h.from_status ? `${orderStatusLabel(h.from_status)} → ` : "Created as "}
                    {orderStatusLabel(h.to_status)}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(h.changed_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {canSeeMoney && (
        <PaymentForm
          open={paymentFormOpen}
          onOpenChange={setPaymentFormOpen}
          orderId={orderId}
          storeId={order.store_id ?? ""}
          balance={balance?.balance ?? 0}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["order-balance", orderId] });
            queryClient.invalidateQueries({ queryKey: ["order-payments", orderId] });
          }}
        />
      )}

      {canSeeMoney && client && currentStore && (
        <ReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          store={currentStore}
          order={order as Tables<"orders">}
          client={client}
          balance={balance ?? null}
          payments={payments ?? []}
        />
      )}

      <PhotoLightbox
        photos={styleRefPhotos ?? []}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <Dialog open={!!pendingStatus} onOpenChange={(open) => !open && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark as {pendingStatus ? orderStatusLabel(pendingStatus) : ""}?
            </DialogTitle>
            <DialogDescription>
              {pendingStatus === "collected" &&
              canSeeMoney &&
              balance &&
              (balance.balance ?? 0) > 0 ? (
                <span className="text-owed">
                  A balance of <MoneyText amount={balance.balance ?? 0} variant="owed" /> is still
                  owed. Confirm collection anyway?
                </span>
              ) : (
                "This updates the order's status for everyone who can see it."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatus(null)}>
              Cancel
            </Button>
            <Button onClick={confirmStatusChange} disabled={updating}>
              {updating ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
