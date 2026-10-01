import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MessageSquareWarning } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE, formatMoney } from "@/lib/jaylor";
import { getOrderApproval, respondToOrderApproval } from "@/lib/order-approvals.functions";
import { getErrorMessage } from "@/lib/utils";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/a/$token")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const approval = await getOrderApproval({ data: { token: params.token } });
    const language = await resolveLanguage({
      data: {
        urlLang: deps.lang,
        clientPreferredLanguage: approval?.clientPreferredLanguage,
        storeLanguage: approval?.storeLanguage,
      },
    });
    const resources = await loadNamespaces(language, ["common", "approval"]);
    return { approval, language, resources };
  },
  head: () => ({
    meta: [
      { title: "Approve your order — Jaylor" },
      {
        name: "description",
        content: "Review your order's details before it goes into production.",
      },
    ],
  }),
  component: OrderApprovalRoute,
});

function OrderApprovalRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <OrderApprovalPage />
    </I18nProvider>
  );
}

function OrderApprovalPage() {
  const { token } = Route.useParams();
  const { approval: initialApproval } = Route.useLoaderData();
  const tc = useT("common");
  const t = useT("approval");
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [responding, setResponding] = useState(false);
  const [showChangesForm, setShowChangesForm] = useState(false);

  const { data: approval, isLoading } = useQuery({
    queryKey: ["order-approval", token],
    queryFn: () => getOrderApproval({ data: { token } }),
    initialData: initialApproval,
  });

  async function respond(status: "approved" | "changes_requested") {
    setResponding(true);
    try {
      const result = await respondToOrderApproval({
        data: { token, status, comment: comment.trim() || undefined },
      });
      if (!result.ok) {
        toast.error(t("error_cannot_respond"));
        return;
      }
      toast.success(status === "approved" ? t("success_approved") : t("success_changes_requested"));
      await queryClient.invalidateQueries({ queryKey: ["order-approval", token] });
    } catch (error) {
      toast.error(getErrorMessage(error, t("error_send_response")));
    } finally {
      setResponding(false);
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
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!approval) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <Link to="/" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>
        <h1 className="mt-8 text-xl">{t("request_not_found_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tc("not_found_description")}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">{tc("go_home")}</Link>
        </Button>
      </main>
    );
  }

  const { snapshot } = approval;
  const measurementEntries = snapshot.measurements
    ? Object.entries(snapshot.measurements.values)
    : [];

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
          {approval.storeLogoUrl && (
            <img
              src={approval.storeLogoUrl}
              alt=""
              className="mx-auto mb-3 size-12 rounded-full object-cover"
            />
          )}
          <p className="text-xs uppercase tracking-[0.18em] text-gold">{approval.storeName}</p>
          <h1 className="mt-2 font-heading text-2xl">
            {snapshot.garment_type} × {snapshot.quantity}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("review_before_cutting")}</p>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
          {snapshot.style_notes && (
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t("style_notes")}
              </p>
              <p className="mt-1 text-sm">{snapshot.style_notes}</p>
            </div>
          )}

          {snapshot.style_reference_photos.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t("reference_photos")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshot.style_reference_photos.map((url) => (
                  <img key={url} src={url} alt="" className="size-16 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          )}

          {snapshot.materials.length > 0 && (
            <>
              <StitchDivider className="my-5" />
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t("fabric")}
              </p>
              <div className="mt-2 space-y-2">
                {snapshot.materials.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center gap-3">
                      {m.photo_urls.length > 0 && (
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {m.photo_urls.map((url, j) => (
                            <img
                              key={j}
                              src={url}
                              alt=""
                              className="size-12 rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <div>
                        <p>{m.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {[m.colour, m.yards ? `${m.yards} yds` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    {m.extras_received && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("also_received", { text: m.extras_received })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {measurementEntries.length > 0 && (
            <>
              <StitchDivider className="my-5" />
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {t("measurements", { unit: snapshot.measurements?.unit ?? "" })}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {measurementEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="figures">{value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <StitchDivider className="my-5" />

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("price")}</span>
              <span className="figures">{formatMoney(snapshot.price, snapshot.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("paid_so_far")}</span>
              <span className="figures text-paid">
                {formatMoney(snapshot.amount_paid, snapshot.currency)}
              </span>
            </div>
            {snapshot.delivery_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("delivery_date")}</span>
                <span>{new Date(snapshot.delivery_date).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <StitchDivider className="my-5" />

          {approval.status === "pending" ? (
            showChangesForm ? (
              <div className="space-y-3">
                <Textarea
                  placeholder={t("changes_placeholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowChangesForm(false)}
                    disabled={responding}
                  >
                    {t("back")}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => respond("changes_requested")}
                    disabled={responding || !comment.trim()}
                  >
                    {responding ? t("sending") : t("send")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowChangesForm(true)}
                  disabled={responding}
                >
                  <MessageSquareWarning className="size-4" />
                  {t("request_changes")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => respond("approved")}
                  disabled={responding}
                >
                  <Check className="size-4" />
                  {responding ? t("sending") : t("approve")}
                </Button>
              </div>
            )
          ) : approval.status === "approved" ? (
            <p className="rounded-xl border border-paid/40 bg-paid/10 p-3 text-center text-sm text-paid">
              {t("approved_message")}
            </p>
          ) : (
            <div className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm text-owed">
              <p>{t("changes_requested_message")}</p>
              {approval.clientComment && <p className="mt-1">{approval.clientComment}</p>}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
