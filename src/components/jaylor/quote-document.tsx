import { toast } from "sonner";
import { Printer, Share2 } from "lucide-react";
import { formatMoney } from "@/lib/jaylor";
import { formatPhoneNG } from "@/lib/phone";
import { computeQuoteTotals, singlePayerFee } from "@/lib/quote";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";
import { Button } from "@/components/ui/button";

export type QuoteData = {
  storeName: string;
  storeLogoUrl: string | null;
  storeCity: string | null;
  storeWhatsapp: string | null;
  jobName: string;
  organiserName: string | null;
  organiserPhone: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  vatEnabled: boolean;
  vatPercent: number;
  validityDate: string | null;
  deliveryDate: string | null;
  depositPercent: number | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  paidAmount: number;
};

/**
 * The quote/invoice document for single-payer contract jobs (school and
 * company uniforms) — same print/share pattern as receipt-dialog.tsx, since
 * that's already proven for this app's "download" story (browser print ->
 * Save as PDF).
 */
export function QuoteDocument({
  data,
  variant,
}: {
  data: QuoteData;
  variant: "quote" | "invoice";
}) {
  const photoUrl = useStorefrontPhotoUrls([data.storeLogoUrl]);
  const logoUrl = photoUrl(data.storeLogoUrl);
  const quantity = data.quantity ?? 0;
  const unitPrice = data.unitPrice ?? 0;
  const { subtotal, vatAmount, total } = computeQuoteTotals(
    quantity,
    unitPrice,
    data.vatEnabled,
    data.vatPercent,
  );
  const fee = singlePayerFee(total);
  const balance = Math.max(0, total - data.paidAmount);
  const depositDue = data.depositPercent ? Math.round(total * (data.depositPercent / 100)) : null;

  function share() {
    const text = `${variant === "quote" ? "Quote" : "Invoice"} from ${data.storeName}\n${data.jobName}\n${quantity} × ${formatMoney(unitPrice)}\nTotal: ${formatMoney(total)}${variant === "invoice" ? `\nBalance: ${formatMoney(balance)}` : ""}`;
    if (navigator.share) {
      navigator.share({ title: `${data.storeName} — ${data.jobName}`, text }).catch(() => {});
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Details copied"))
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <div>
      <div className="flex justify-center gap-2 print:hidden">
        <Button variant="outline" className="flex-1" onClick={share}>
          <Share2 className="size-4" />
          Share
        </Button>
        <Button className="flex-1" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div
        id="jaylor-quote"
        className="mx-auto mt-4 w-full space-y-4 rounded-2xl border bg-white p-6 text-sm text-black"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-black/10 font-heading text-lg">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                data.storeName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <p className="font-heading text-base">{data.storeName}</p>
              {data.storeCity && <p className="text-xs opacity-70">{data.storeCity}</p>}
              {data.storeWhatsapp && (
                <p className="text-xs opacity-70">{formatPhoneNG(data.storeWhatsapp)}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.1em] opacity-60">
              {variant === "quote" ? "Quote" : "Invoice"}
            </p>
            {variant === "invoice" && data.invoiceNumber && (
              <p className="figures text-xs opacity-70">{data.invoiceNumber}</p>
            )}
            {data.poNumber && <p className="figures text-xs opacity-70">PO {data.poNumber}</p>}
          </div>
        </div>

        <div className="border-t border-dashed border-black/20 pt-3">
          <p className="font-medium">{data.jobName}</p>
          {data.organiserName && (
            <p className="text-xs opacity-70">
              {data.organiserName}
              {data.organiserPhone ? ` · ${formatPhoneNG(data.organiserPhone)}` : ""}
            </p>
          )}
          {data.description && <p className="mt-1 text-xs opacity-70">{data.description}</p>}
        </div>

        <div className="border-t border-dashed border-black/20 pt-3">
          <div className="flex justify-between">
            <span>
              {quantity} × {formatMoney(unitPrice)}
            </span>
            <span className="figures">{formatMoney(subtotal)}</span>
          </div>
          {data.vatEnabled && (
            <div className="mt-1 flex justify-between text-xs opacity-70">
              <span>VAT ({data.vatPercent}%)</span>
              <span className="figures">{formatMoney(vatAmount)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-black/20 pt-2 font-medium">
            <span>Total</span>
            <span className="figures">{formatMoney(total)}</span>
          </div>
        </div>

        {variant === "invoice" && (
          <div className="space-y-1 border-t border-dashed border-black/20 pt-3 text-xs opacity-70">
            <div className="flex justify-between">
              <span>Paid</span>
              <span className="figures">{formatMoney(data.paidAmount)}</span>
            </div>
            <div className="flex justify-between font-medium text-black opacity-100">
              <span>Balance</span>
              <span className="figures">{formatMoney(balance)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1 border-t border-dashed border-black/20 pt-3 text-xs opacity-70">
          {data.depositPercent != null && depositDue != null && (
            <div className="flex justify-between">
              <span>Payment terms</span>
              <span>
                {data.depositPercent}% deposit ({formatMoney(depositDue)}), balance on delivery
              </span>
            </div>
          )}
          {variant === "quote" && data.validityDate && (
            <div className="flex justify-between">
              <span>Valid until</span>
              <span>{new Date(data.validityDate).toLocaleDateString()}</span>
            </div>
          )}
          {data.deliveryDate && (
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>{new Date(data.deliveryDate).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Jaylor Pay fee (est.)</span>
            <span className="figures">{formatMoney(fee)}</span>
          </div>
        </div>

        <p className="border-t border-dashed border-black/20 pt-3 text-center text-[10px] opacity-60">
          Made with Jaylor.
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-quote, #jaylor-quote * { visibility: visible; }
          #jaylor-quote { position: fixed; inset: 0 auto auto 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
