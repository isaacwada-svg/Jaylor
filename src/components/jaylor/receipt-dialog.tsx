import { useState } from "react";
import { toast } from "sonner";
import { Printer, Share2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";
import { formatMoney } from "@/lib/jaylor";
import { formatPhoneNG } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OrderRow = Tables<"orders">;
type ClientRow = Tables<"clients">;
type PaymentRow = Tables<"payments">;
type BalanceRow = { total: number | null; paid: number | null; balance: number | null } | null;

export function ReceiptDialog({
  open,
  onOpenChange,
  store,
  order,
  client,
  balance,
  payments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: {
    id: string;
    name: string;
    logo_url: string | null;
    city: string | null;
    whatsapp_phone: string | null;
    address: string | null;
    contact_email: string | null;
  };
  order: OrderRow;
  client: ClientRow;
  balance: BalanceRow;
  payments: PaymentRow[];
}) {
  const [format, setFormat] = useState<"pos" | "a4">("a4");
  const photoUrl = useStorefrontPhotoUrls([store.logo_url]);
  const logo = photoUrl(store.logo_url);
  const activePayments = payments.filter((p) => !p.voided);
  const total = balance?.total ?? order.price;
  const paid = balance?.paid ?? 0;
  const owed = balance?.balance ?? total - paid;

  function shareSummary() {
    const text = `Receipt from ${store.name}\nOrder ${order.number} · ${order.garment_type}\nTotal: ${formatMoney(total)}\nPaid: ${formatMoney(paid)}\nBalance: ${formatMoney(owed)}`;
    if (navigator.share) {
      navigator.share({ title: `Receipt — ${order.number}`, text }).catch(() => {});
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Receipt details copied"))
      .catch(() => toast.error("Could not copy the receipt"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center gap-2 print:hidden">
          <Button
            size="sm"
            variant={format === "a4" ? "default" : "outline"}
            onClick={() => setFormat("a4")}
          >
            A4 invoice
          </Button>
          <Button
            size="sm"
            variant={format === "pos" ? "default" : "outline"}
            onClick={() => setFormat("pos")}
          >
            80mm receipt
          </Button>
        </div>

        <div
          id="jaylor-receipt"
          data-format={format}
          className={
            format === "pos"
              ? "mx-auto w-[80mm] space-y-3 bg-white p-3 text-[11px] text-black"
              : "mx-auto w-full space-y-4 bg-white p-6 text-sm text-black"
          }
        >
          {format === "a4" ? (
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#b8860b] pb-4">
              <div className="flex items-start gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 font-heading text-xl">
                  {logo ? (
                    <img src={logo} alt="" className="size-full object-cover" />
                  ) : (
                    store.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-heading text-xl">{store.name}</p>
                  {store.address && (
                    <p className="mt-0.5 max-w-xs text-xs opacity-70">{store.address}</p>
                  )}
                  {store.city && <p className="text-xs opacity-70">{store.city}</p>}
                  <p className="mt-0.5 text-xs opacity-70">
                    {store.whatsapp_phone && formatPhoneNG(store.whatsapp_phone)}
                    {store.whatsapp_phone && store.contact_email && " · "}
                    {store.contact_email}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] opacity-60">Invoice</p>
                <p className="font-medium">{order.number}</p>
                <p className="text-xs opacity-70">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-black/10 font-heading text-lg">
                {logo ? (
                  <img src={logo} alt="" className="size-full object-cover" />
                ) : (
                  store.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <p className="mt-2 font-heading text-base">{store.name}</p>
              {store.address && <p className="text-xs opacity-70">{store.address}</p>}
              {store.city && <p className="text-xs opacity-70">{store.city}</p>}
              {store.whatsapp_phone && (
                <p className="text-xs opacity-70">{formatPhoneNG(store.whatsapp_phone)}</p>
              )}
              {store.contact_email && <p className="text-xs opacity-70">{store.contact_email}</p>}
            </div>
          )}

          <div className="border-t border-dashed border-black/20 pt-3">
            {format === "a4" && <p className="text-xs font-medium opacity-70">Bill to</p>}
            <p className="font-medium">{client.full_name}</p>
            <p className="text-xs opacity-70">{formatPhoneNG(client.phone)}</p>
          </div>

          <div className={format === "a4" ? "pt-1" : "border-t border-dashed border-black/20 pt-3"}>
            {format === "a4" && (
              <div className="flex justify-between border-b border-black/20 pb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">
                <span>Description</span>
                <span>Amount</span>
              </div>
            )}
            <div className={format === "a4" ? "flex justify-between pt-2" : "flex justify-between"}>
              <span>
                {order.garment_type} × {order.quantity}
              </span>
              <span className="figures">{formatMoney(total)}</span>
            </div>
          </div>

          {activePayments.length > 0 && (
            <div className="border-t border-dashed border-black/20 pt-3">
              <p className="text-xs font-medium opacity-70">Payments</p>
              {activePayments.map((p) => (
                <div key={p.id} className="mt-1 flex justify-between text-xs">
                  <span>
                    {new Date(p.paid_at).toLocaleDateString()} · {p.method}
                  </span>
                  <span className="figures">{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={
              format === "a4"
                ? "ml-auto w-56 space-y-1 border-t-2 border-black/80 pt-3"
                : "space-y-1 border-t border-black/20 pt-3"
            }
          >
            <div className="flex justify-between text-xs opacity-70">
              <span>Total</span>
              <span className="figures">{formatMoney(total)}</span>
            </div>
            <div className="flex justify-between text-xs opacity-70">
              <span>Paid</span>
              <span className="figures">{formatMoney(paid)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance</span>
              <span className="figures">{formatMoney(owed)}</span>
            </div>
          </div>

          <p
            className={
              format === "a4"
                ? "border-t border-black/10 pt-3 text-center text-[10px] opacity-60"
                : "border-t border-dashed border-black/20 pt-3 text-center text-[10px] opacity-60"
            }
          >
            Thank you for your business. Made with Jaylor.
          </p>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" className="flex-1" onClick={shareSummary}>
            <Share2 className="size-4" />
            Share
          </Button>
          <Button className="flex-1" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print / Save as PDF
          </Button>
        </div>
      </DialogContent>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-receipt, #jaylor-receipt * { visibility: visible; }
          #jaylor-receipt { position: fixed; inset: 0 auto auto 0; }
        }
      `}</style>
    </Dialog>
  );
}
