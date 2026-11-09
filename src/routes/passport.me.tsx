import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, QrCode as QrCodeIcon, ShieldOff } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPANY_LINE } from "@/lib/jaylor";
import { templateFields, type TemplateField } from "@/lib/measurements";
import type { Tables } from "@/integrations/supabase/types";
import {
  diffMeasurementFields,
  countChanged,
  makeValueKeyLabeller,
  type MeasurementFieldChange,
} from "@/lib/measurement-diff";
import {
  getPassportView,
  createPassportShare,
  listPassportShares,
  revokePassportShare,
  type PassportClientRecord,
  type PassportMeasurementVersion,
  type PassportTemplate,
  type PassportShareRow,
} from "@/lib/passport-me.functions";
import { clearPassportSession, getPassportSession } from "@/lib/passport-session";
import { getErrorMessage } from "@/lib/utils";
import { whatsappLink, directoryPassportShareMessage } from "@/lib/whatsapp";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/passport/me")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareTo?: string; shareToName?: string; shareToWhatsapp?: string; lang?: string } => ({
    ...(typeof search["shareTo"] === "string" ? { shareTo: search["shareTo"] } : {}),
    ...(typeof search["shareToName"] === "string" ? { shareToName: search["shareToName"] } : {}),
    ...(typeof search["shareToWhatsapp"] === "string"
      ? { shareToWhatsapp: search["shareToWhatsapp"] }
      : {}),
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    const language = await resolveLanguage({ data: { urlLang: deps.lang } });
    const resources = await loadNamespaces(language, ["common", "passport"]);
    return { language, resources };
  },
  head: () => ({
    meta: [{ title: "My Passport: Jaylor" }],
  }),
  component: PassportMeRoute,
});

function PassportMeRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <PassportMePage />
    </I18nProvider>
  );
}

function versionFields(
  templates: PassportTemplate[],
  version: PassportMeasurementVersion,
): TemplateField[] {
  const template = templates.find((t) => t.id === version.template_id);
  if (!template) return [];
  return templateFields({ fields: template.fields } as Tables<"measurement_templates">);
}

function PassportMePage() {
  const navigate = useNavigate();
  const t = useT("passport");
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { shareToName, shareToWhatsapp } = Route.useSearch();

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareQr, setShareQr] = useState("");
  const [creatingShare, setCreatingShare] = useState(false);
  const [historyRecord, setHistoryRecord] = useState<PassportClientRecord | null>(null);

  useEffect(() => {
    const token = getPassportSession();
    if (!token) {
      navigate({ to: "/passport/claim" });
      return;
    }
    setSessionToken(token);
  }, [navigate]);

  const { data: view, isLoading } = useQuery({
    queryKey: ["passport-view", sessionToken],
    enabled: !!sessionToken && online,
    queryFn: async () => {
      const result = await getPassportView({ data: { sessionToken: sessionToken as string } });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    retry: false,
  });

  const { data: shares } = useQuery({
    queryKey: ["passport-shares", sessionToken],
    enabled: !!sessionToken && online,
    queryFn: async () => {
      const result = await listPassportShares({ data: { sessionToken: sessionToken as string } });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    retry: false,
  });

  async function handleShare() {
    if (!sessionToken) return;
    setCreatingShare(true);
    try {
      const result = await createPassportShare({ data: { sessionToken } });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const url = `${window.location.origin}/passport/share/${result.token}`;
      setShareUrl(url);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      setShareQr(qr);
      setShareOpen(true);
      queryClient.invalidateQueries({ queryKey: ["passport-shares", sessionToken] });
    } catch (error) {
      toast.error(getErrorMessage(error, t("share_create_error")));
    } finally {
      setCreatingShare(false);
    }
  }

  async function handleRevoke(shareId: string) {
    if (!sessionToken) return;
    if (!window.confirm(t("revoke_confirm"))) return;
    try {
      const result = await revokePassportShare({ data: { sessionToken, shareId } });
      if (!result.ok) {
        toast.error(result.error ?? t("share_off_error"));
        return;
      }
      toast.success(t("share_off_success"));
      queryClient.invalidateQueries({ queryKey: ["passport-shares", sessionToken] });
    } catch (error) {
      toast.error(getErrorMessage(error, t("share_off_error")));
    }
  }

  const shopsWithAccess = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of view?.records ?? []) {
      map.set(record.store_id, record.store_name);
    }
    return [...map.entries()].map(([storeId, storeName]) => ({ storeId, storeName }));
  }, [view]);

  if (!online) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
            <BrandLogo markClassName="h-12 w-auto" />
          </Link>
          <div className="mt-8">
            <OfflineNotice label={t("offline_view")} />
          </div>
        </div>
      </main>
    );
  }

  if (!sessionToken || isLoading) {
    return (
      <main className="linen min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <Link to="/" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>
        <h1 className="mt-8 text-xl">{t("session_expired_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("session_expired_description")}</p>
        <Button
          asChild
          className="mt-6"
          onClick={() => {
            clearPassportSession();
          }}
        >
          <Link to="/passport/claim">{t("verify_again")}</Link>
        </Button>
      </main>
    );
  }

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

        <h1 className="mt-8 text-center font-heading text-2xl">{t("your_measurements_title")}</h1>

        {view.records.length === 0 ? (
          <div className="mt-6 rounded-2xl border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("no_measurements_yet")}</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {view.records.map((record) => (
              <PassportRecordCard
                key={record.client_id}
                record={record}
                templates={view.templates}
                onViewHistory={() => setHistoryRecord(record)}
              />
            ))}
          </div>
        )}

        <StitchDivider className="my-6" />

        <div className="rounded-2xl border bg-card p-5">
          {shareToName ? (
            <>
              <p className="font-medium">{t("share_with_name", { name: shareToName })}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("share_create_then_send")}</p>
            </>
          ) : (
            <>
              <p className="font-medium">{t("share_with_new_tailor")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("share_generate_description")}
              </p>
            </>
          )}
          <Button className="mt-3 w-full" disabled={creatingShare} onClick={handleShare}>
            <QrCodeIcon className="size-4" />
            {creatingShare ? t("creating") : t("create_share_link_button")}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to="/tailors" className="font-medium text-gold underline-offset-4 hover:underline">
            {t("find_tailor_link")}
          </Link>
        </p>

        {(shopsWithAccess.length > 0 || (shares && shares.length > 0)) && (
          <div className="mt-4 rounded-2xl border bg-card p-5">
            <p className="font-medium">{t("shops_with_access_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("shops_with_access_note")}</p>

            {shopsWithAccess.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {shopsWithAccess.map((shop) => (
                  <div key={shop.storeId} className="text-sm">
                    {shop.storeName}
                  </div>
                ))}
              </div>
            )}

            {shares && shares.length > 0 && (
              <div className="mt-3 space-y-2">
                {shares.map((share) => (
                  <ShareRow key={share.id} share={share} onRevoke={() => handleRevoke(share.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("share_dialog_title")}</DialogTitle>
          </DialogHeader>
          {shareQr && (
            <img src={shareQr} alt="QR code to share your Passport" className="mx-auto size-48" />
          )}
          <p className="break-all rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
            {shareUrl}
          </p>
          <p className="text-sm text-muted-foreground">{t("share_dialog_instructions")}</p>
          {shareToWhatsapp && shareUrl && (
            <Button asChild className="w-full">
              <a
                href={whatsappLink(shareToWhatsapp, directoryPassportShareMessage(shareUrl))}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("send_to_whatsapp", { name: shareToName ?? t("this_tailor") })}
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyRecord} onOpenChange={(open) => !open && setHistoryRecord(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("history_dialog_title")}</DialogTitle>
          </DialogHeader>
          {historyRecord && <RecordHistory record={historyRecord} templates={view.templates} />}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function PassportRecordCard({
  record,
  templates,
  onViewHistory,
}: {
  record: PassportClientRecord;
  templates: PassportTemplate[];
  onViewHistory: () => void;
}) {
  const t = useT("passport");
  const latest = record.versions[0];
  const previous = record.versions[1];
  const fields = latest ? versionFields(templates, latest) : [];
  const values = (latest?.values ?? {}) as Record<string, number>;
  const extra = (latest?.extra_fields ?? {}) as Record<string, number | string>;

  let changed = 0;
  if (latest && previous) {
    const labeller = makeValueKeyLabeller(
      versionFields(templates, previous),
      versionFields(templates, latest),
    );
    changed = countChanged(
      diffMeasurementFields(
        {
          values: previous.values,
          extra_fields: previous.extra_fields,
          unit: previous.unit,
          template_id: previous.template_id,
        },
        {
          values: latest.values,
          extra_fields: latest.extra_fields,
          unit: latest.unit,
          template_id: latest.template_id,
        },
        labeller,
      ),
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          {record.relation === "guardian" ? t("for_name", { name: record.full_name }) : t("you")}
        </p>
        <p className="text-xs text-muted-foreground">{record.store_name}</p>
      </div>

      {!latest ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("no_measurements_here")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("taken_date", { date: new Date(latest.taken_at).toLocaleDateString() })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {fields.map(
              (f) =>
                values[f.key] !== undefined && (
                  <div key={f.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="figures">
                      {values[f.key]}
                      {latest.unit}
                    </span>
                  </div>
                ),
            )}
            {Object.entries(extra).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="figures">{value}</span>
              </div>
            ))}
          </div>

          {record.versions.length > 1 && (
            <button
              type="button"
              onClick={onViewHistory}
              className="mt-3 w-full rounded-xl border border-gold/40 bg-accent/30 p-2 text-left text-sm hover:bg-accent/50"
            >
              {changed === 1
                ? t("changed_since_one", {
                    date: previous ? new Date(previous.taken_at).toLocaleDateString() : "",
                  })
                : t("changed_since_other", {
                    count: changed,
                    date: previous ? new Date(previous.taken_at).toLocaleDateString() : "",
                  })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RecordHistory({
  record,
  templates,
}: {
  record: PassportClientRecord;
  templates: PassportTemplate[];
}) {
  const t = useT("passport");
  if (record.versions.length <= 1) {
    return <p className="text-sm text-muted-foreground">{t("first_measurement_nothing")}</p>;
  }

  return (
    <div className="space-y-5">
      {record.versions.slice(0, -1).map((newer, i) => {
        const older = record.versions[i + 1];
        if (!older) return null;
        const labeller = makeValueKeyLabeller(
          versionFields(templates, older),
          versionFields(templates, newer),
        );
        const changes = diffMeasurementFields(
          {
            values: older.values,
            extra_fields: older.extra_fields,
            unit: older.unit,
            template_id: older.template_id,
          },
          {
            values: newer.values,
            extra_fields: newer.extra_fields,
            unit: newer.unit,
            template_id: newer.template_id,
          },
          labeller,
        ).filter((c) => c.status !== "unchanged");

        return (
          <div key={newer.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                v{older.version} → v{newer.version}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(newer.taken_at).toLocaleDateString()}
              </p>
            </div>
            <div className="mt-2 space-y-1.5">
              {changes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("no_meaningful_changes")}</p>
              ) : (
                changes.map((c) => <ChangeRow key={c.key} change={c} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChangeRow({ change }: { change: MeasurementFieldChange }) {
  const t = useT("passport");
  const arrow =
    change.status === "increased" ? (
      <ArrowUp className="size-3.5 shrink-0 text-owed" />
    ) : change.status === "decreased" ? (
      <ArrowDown className="size-3.5 shrink-0 text-paid" />
    ) : null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {arrow}
      <span className="min-w-0 flex-1">
        <span className="font-medium">{change.label}</span>{" "}
        {change.status === "added" ? (
          <span className="text-muted-foreground">
            {change.newDisplay} {t("added_suffix")}
          </span>
        ) : change.status === "removed" ? (
          <span className="text-muted-foreground">
            {change.oldDisplay} {t("removed_suffix")}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {change.oldDisplay} → {change.newDisplay}
            {change.deltaText && ` (${change.deltaText})`}
          </span>
        )}
      </span>
    </div>
  );
}

function ShareRow({ share, onRevoke }: { share: PassportShareRow; onRevoke: () => void }) {
  const t = useT("passport");
  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
      <div>
        <p>{t("created_date", { date: new Date(share.created_at).toLocaleDateString() })}</p>
        <p className="text-xs text-muted-foreground">
          {share.revoked_at
            ? t("turned_off")
            : share.used_by_store_name
              ? t("used_by", { name: share.used_by_store_name })
              : t("not_used_yet")}
        </p>
      </div>
      {!share.revoked_at && (
        <Button size="sm" variant="ghost" className="text-owed" onClick={onRevoke}>
          <ShieldOff className="size-4" />
          {t("revoke")}
        </Button>
      )}
    </div>
  );
}
