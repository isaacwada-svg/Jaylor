import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { QuoteForm } from "@/components/jaylor/quote-form";
import { RemindButton } from "@/components/jaylor/remind-button";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { formatMoney } from "@/lib/jaylor";
import { formatPhoneNG } from "@/lib/phone";
import { computeQuoteTotal, quoteStatusLabel } from "@/lib/quote-totals";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/quotations/$quoteId")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Quote — Jaylor" }] }),
  component: QuoteDetail,
});

function QuoteDetail() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canManageOrders = currentRole === "owner" || currentRole === "manager";
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "pos" | "credit">(
    "cash",
  );
  const [converting, setConverting] = useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: client } = useQuery({
    queryKey: ["quote-client", quote?.client_id],
    enabled: !!quote,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, whatsapp_phone, consent_whatsapp")
        .eq("id", quote!.client_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const photoUrl = useStorefrontPhotoUrls([currentStore?.logo_url ?? null]);
  const logo = currentStore ? photoUrl(currentStore.logo_url) : null;

  async function deleteQuote() {
    if (!quote) return;
    if (!window.confirm("Delete this quote? This can't be undone.")) return;
    try {
      const { error } = await supabase.from("quotes").delete().eq("id", quote.id);
      if (error) throw error;
      toast.success("Quote deleted");
      navigate({ to: "/quotations" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete this quote"));
    }
  }

  async function convertToOrder() {
    if (!quote || !storeId) return;
    setConverting(true);
    try {
      const { total } = computeQuoteTotal(quote.quantity, quote.unit_price, quote.discount_percent);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          store_id: storeId,
          client_id: quote.client_id,
          number: "",
          garment_type: quote.garment_type,
          garment_type_code: quote.garment_type_code,
          quantity: quote.quantity,
          price: total,
          style_notes: quote.notes,
          created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        })
        .select("id")
        .single();
      if (orderError) throw orderError;

      if (paymentMethod !== "credit") {
        const { error: paymentError } = await supabase.from("payments").insert({
          store_id: storeId,
          order_id: order.id,
          amount: total,
          method: paymentMethod,
          paid_at: new Date().toISOString(),
        });
        if (paymentError) throw paymentError;
      }

      const { error: updateError } = await supabase
        .from("quotes")
        .update({ status: "converted", converted_order_id: order.id })
        .eq("id", quote.id);
      if (updateError) throw updateError;

      toast.success("Converted to an order");
      queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
      navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not convert this quote"));
    } finally {
      setConverting(false);
      setConvertOpen(false);
    }
  }

  if (isLoading || !quote) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  const expired = new Date(quote.valid_until) < new Date();
  const label = quoteStatusLabel(quote.status, expired);
  const { subtotal, discountAmount, total } = computeQuoteTotal(
    quote.quantity,
    quote.unit_price,
    quote.discount_percent,
  );
  const quoteLink = `${window.location.origin}/q/${quote.quote_token}`;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/quotations">
              <ArrowLeft className="size-4" />
              Quotations
            </Link>
          </Button>
          <Badge
            variant="outline"
            className={
              label === "Accepted" || label === "Converted to order"
                ? "border-paid/40 text-paid"
                : label === "Expired"
                  ? "border-owed/40 text-owed"
                  : "border-gold text-gold"
            }
          >
            {label}
          </Badge>
        </div>
        <StitchDivider className="my-6" />

        <div
          id="jaylor-quote-print"
          className="mx-auto w-full space-y-4 rounded-2xl bg-white p-6 text-sm text-black print:rounded-none"
        >
          <div className="flex items-start justify-between gap-4 border-b-2 border-[#b8860b] pb-4">
            <div className="flex items-start gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 font-heading text-xl">
                {logo ? (
                  <img src={logo} alt="" className="size-full object-cover" />
                ) : (
                  currentStore?.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <p className="font-heading text-xl">{currentStore?.name}</p>
                {currentStore?.address && (
                  <p className="mt-0.5 max-w-xs text-xs opacity-70">{currentStore.address}</p>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] opacity-60">Quote</p>
              <p className="font-medium">{quote.quote_number}</p>
              <p className="text-xs opacity-70">
                {new Date(quote.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="border-t border-dashed border-black/20 pt-3">
            <p className="text-xs font-medium opacity-70">Quoted for</p>
            <p className="font-medium">{client?.full_name}</p>
            {client?.phone && <p className="text-xs opacity-70">{formatPhoneNG(client.phone)}</p>}
          </div>

          <div className="pt-1">
            <div className="flex justify-between border-b border-black/20 pb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">
              <span>Description</span>
              <span>Amount</span>
            </div>
            <div className="flex justify-between pt-2">
              <span>
                {quote.garment_type} × {quote.quantity}
              </span>
              <span className="figures">{formatMoney(subtotal)}</span>
            </div>
            {quote.discount_percent > 0 && (
              <div className="mt-1 flex justify-between text-xs opacity-70">
                <span>Discount ({quote.discount_percent}%)</span>
                <span className="figures">-{formatMoney(discountAmount)}</span>
              </div>
            )}
            {quote.notes && <p className="mt-2 text-xs opacity-70">{quote.notes}</p>}
          </div>

          <div className="ml-auto w-56 space-y-1 border-t-2 border-black/80 pt-3">
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="figures">{formatMoney(total)}</span>
            </div>
          </div>

          <p className="border-t border-black/10 pt-3 text-center text-[10px] opacity-60">
            Valid until {new Date(quote.valid_until).toLocaleDateString()}. Made with Jaylor.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Download / Print
          </Button>
          {client && (
            <RemindButton
              storeId={storeId as string}
              clientId={client.id}
              phone={client.whatsapp_phone ?? client.phone}
              consentWhatsapp={client.consent_whatsapp}
              template="quote_sent"
              message={`Hi ${client.full_name}, here's your quote from ${currentStore?.name}: ${quoteLink} (valid until ${new Date(quote.valid_until).toLocaleDateString()})`}
              label="Share on WhatsApp"
            />
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          {canManageOrders && quote.status !== "converted" && (
            <Button onClick={() => setConvertOpen(true)}>Convert to sale</Button>
          )}
          {canManageOrders && quote.status !== "converted" && (
            <Button variant="ghost" className="text-owed" onClick={deleteQuote}>
              Delete
            </Button>
          )}
          {quote.status === "converted" && quote.converted_order_id && (
            <Button variant="outline" asChild>
              <Link to="/orders/$orderId" params={{ orderId: quote.converted_order_id }}>
                View order
              </Link>
            </Button>
          )}
        </div>
      </div>

      {storeId && (
        <QuoteForm
          open={editOpen}
          onOpenChange={setEditOpen}
          storeId={storeId}
          quote={quote}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["quote", quoteId] })}
        />
      )}

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to sale</DialogTitle>
            <DialogDescription>
              Creates an order for {formatMoney(total)} and takes it off this quote.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Paid by cash</SelectItem>
              <SelectItem value="transfer">Paid by transfer</SelectItem>
              <SelectItem value="pos">Paid by card (POS)</SelectItem>
              <SelectItem value="credit">On credit — pay later</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={convertToOrder} disabled={converting} className="w-full">
              {converting ? "Converting..." : "Convert to sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-quote-print, #jaylor-quote-print * { visibility: visible; }
          #jaylor-quote-print { position: fixed; inset: 0 auto auto 0; width: 100%; }
        }
      `}</style>
    </AppShell>
  );
}
