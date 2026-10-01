import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Printer } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, COMPANY_LINE } from "@/lib/jaylor";
import { computeQuoteTotal } from "@/lib/quote-totals";
import { getQuotePreview, acceptQuote } from "@/lib/quotes.functions";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/q/$token")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const quote = await getQuotePreview({ data: { token: params.token } });
    const language = await resolveLanguage({
      data: {
        urlLang: deps.lang,
        clientPreferredLanguage: quote?.clientPreferredLanguage,
        storeLanguage: quote?.storeLanguage,
      },
    });
    const resources = await loadNamespaces(language, ["common", "quotes"]);
    return { quote, language, resources };
  },
  head: () => ({ meta: [{ title: "Your quote — Jaylor" }] }),
  component: PublicQuoteRoute,
});

function PublicQuoteRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <PublicQuote />
    </I18nProvider>
  );
}

function PublicQuote() {
  const { token } = Route.useParams();
  const { quote: initialQuote } = Route.useLoaderData();
  const t = useT("quotes");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => getQuotePreview({ data: { token } }),
    initialData: initialQuote,
  });

  async function handleAccept() {
    setAccepting(true);
    try {
      const result = await acceptQuote({ data: { token } });
      if (!result.ok) {
        toast.error(t("quote_no_longer_acceptable"));
        return;
      }
      setAccepted(true);
      toast.success(t("accept_success"));
    } catch {
      toast.error(t("generic_error"));
    } finally {
      setAccepting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="linen flex min-h-screen items-center justify-center bg-background px-4">
        <Skeleton className="h-64 w-full max-w-md rounded-2xl" />
      </main>
    );
  }

  if (!quote) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-center">
        <BrandLogo markClassName="h-10 w-auto" />
        <h1 className="mt-4 text-xl">{t("invalid_link_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("invalid_link_description")}</p>
      </main>
    );
  }

  const { subtotal, discountAmount, total } = computeQuoteTotal(
    quote.quantity,
    quote.unitPrice,
    quote.discountPercent,
  );
  const isAccepted = accepted || quote.status === "accepted" || quote.status === "converted";
  const canAccept = !quote.expired && (quote.status === "draft" || quote.status === "sent");

  function copyAccountNumber() {
    if (!quote?.payoutAccount) return;
    navigator.clipboard
      .writeText(quote.payoutAccount.accountNumber)
      .then(() => toast.success(t("account_copied")))
      .catch(() => toast.error(t("copy_failed")));
  }

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between print:hidden">
          <span />
          <LanguageSwitcher />
        </div>
        <div className="flex justify-center">
          <BrandLogo markClassName="h-10 w-auto" />
        </div>

        <div
          id="jaylor-public-quote"
          className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6 text-sm"
        >
          <div className="flex items-start justify-between gap-4 border-b-2 border-gold pb-4">
            <div>
              <p className="font-heading text-xl">{quote.storeName}</p>
              {quote.storeAddress && (
                <p className="mt-0.5 text-xs text-muted-foreground">{quote.storeAddress}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {t("quote_label")}
              </p>
              <p className="font-medium">{quote.quoteNumber}</p>
            </div>
          </div>

          <div className="border-t border-dashed border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">{t("quoted_for")}</p>
            <p className="font-medium">{quote.clientName}</p>
          </div>

          <div className="pt-1">
            <div className="flex justify-between pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>{t("description_label")}</span>
              <span>{t("amount_label")}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span>
                {quote.garmentType} × {quote.quantity}
              </span>
              <span className="figures">{formatMoney(subtotal, quote.currency)}</span>
            </div>
            {quote.discountPercent > 0 && (
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{t("discount_label", { percent: quote.discountPercent })}</span>
                <span className="figures">-{formatMoney(discountAmount, quote.currency)}</span>
              </div>
            )}
            {quote.notes && <p className="mt-2 text-xs text-muted-foreground">{quote.notes}</p>}
          </div>

          <div className="ml-auto w-48 space-y-1 border-t-2 border-foreground/80 pt-3">
            <div className="flex justify-between font-medium">
              <span>{t("total_label")}</span>
              <span className="figures">{formatMoney(total, quote.currency)}</span>
            </div>
          </div>

          {quote.payoutAccount && quote.currency === "NGN" && (
            <div className="border-t border-dashed border-border pt-3 text-center">
              <p className="text-xs text-muted-foreground">{t("pay_by_transfer")}</p>
              <p className="figures font-medium">{quote.payoutAccount.accountNumber}</p>
              <p className="text-xs text-muted-foreground">
                {quote.payoutAccount.accountName} · {quote.payoutAccount.bankName}
              </p>
            </div>
          )}

          <p className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
            {quote.expired
              ? t("expired")
              : t("valid_until", { date: new Date(quote.validUntil).toLocaleDateString() })}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2 print:hidden">
          {quote.payoutAccount && quote.currency === "NGN" && (
            <Button variant="outline" onClick={copyAccountNumber}>
              <Copy className="size-4" />
              {t("copy_account_number")}
            </Button>
          )}
          {isAccepted ? (
            <p className="rounded-xl border border-paid/40 bg-paid/10 p-3 text-center text-sm text-paid">
              {t("accepted_message")}
            </p>
          ) : canAccept ? (
            <Button onClick={handleAccept} disabled={accepting}>
              {accepting ? t("accepting") : t("accept_quote_button")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("download_print")}
          </Button>
        </div>

        <StitchDivider className="my-6" />
        <p className="text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-public-quote, #jaylor-public-quote * { visibility: visible; }
          #jaylor-public-quote { position: fixed; inset: 0 auto auto 0; width: 100%; }
        }
      `}</style>
    </main>
  );
}
