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

export const Route = createFileRoute("/passport/me")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareTo?: string; shareToName?: string; shareToWhatsapp?: string } => ({
    ...(typeof search["shareTo"] === "string" ? { shareTo: search["shareTo"] } : {}),
    ...(typeof search["shareToName"] === "string" ? { shareToName: search["shareToName"] } : {}),
    ...(typeof search["shareToWhatsapp"] === "string"
      ? { shareToWhatsapp: search["shareToWhatsapp"] }
      : {}),
  }),
  head: () => ({
    meta: [{ title: "My Passport — Jaylor" }],
  }),
  component: PassportMePage,
});

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
      toast.error(getErrorMessage(error, "Could not create a share link"));
    } finally {
      setCreatingShare(false);
    }
  }

  async function handleRevoke(shareId: string) {
    if (!sessionToken) return;
    if (!window.confirm("Turn off this share link? It will stop working for any shop.")) return;
    try {
      const result = await revokePassportShare({ data: { sessionToken, shareId } });
      if (!result.ok) {
        toast.error(result.error ?? "Could not turn off this link");
        return;
      }
      toast.success("Share link turned off");
      queryClient.invalidateQueries({ queryKey: ["passport-shares", sessionToken] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not turn off this link"));
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
            <OfflineNotice label="Connect to the internet to see your Passport." />
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
        <h1 className="mt-8 text-xl">Your session has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please verify your phone again.</p>
        <Button
          asChild
          className="mt-6"
          onClick={() => {
            clearPassportSession();
          }}
        >
          <Link to="/passport/claim">Verify again</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <h1 className="mt-8 text-center font-heading text-2xl">Your measurements</h1>

        {view.records.length === 0 ? (
          <div className="mt-6 rounded-2xl border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No measurements yet. Ask any Jaylor tailor to measure you and save it to your Passport
              — it will show up here automatically as soon as your phone number matches.
            </p>
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
              <p className="font-medium">Share your Passport with {shareToName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a link, then send it to them on WhatsApp.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Share with a new tailor</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a link and QR code. Any Jaylor shop can scan it to bring in your latest
                measurements instantly.
              </p>
            </>
          )}
          <Button className="mt-3 w-full" disabled={creatingShare} onClick={handleShare}>
            <QrCodeIcon className="size-4" />
            {creatingShare ? "Creating..." : "Create a share link"}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to="/tailors" className="font-medium text-gold underline-offset-4 hover:underline">
            Find a Jaylor tailor
          </Link>
        </p>

        {(shopsWithAccess.length > 0 || (shares && shares.length > 0)) && (
          <div className="mt-4 rounded-2xl border bg-card p-5">
            <p className="font-medium">Shops with access</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Measurements a shop has already copied stay in that shop&apos;s own records — turning
              off a share only stops future viewing or importing through that link.
            </p>

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
            <DialogTitle>Share with a new tailor</DialogTitle>
          </DialogHeader>
          {shareQr && (
            <img src={shareQr} alt="QR code to share your Passport" className="mx-auto size-48" />
          )}
          <p className="break-all rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
            {shareUrl}
          </p>
          <p className="text-sm text-muted-foreground">
            Show this to a new tailor, or send them the link. If they&apos;re not on Jaylor yet, it
            takes them to sign up first.
          </p>
          {shareToWhatsapp && shareUrl && (
            <Button asChild className="w-full">
              <a
                href={whatsappLink(shareToWhatsapp, directoryPassportShareMessage(shareUrl))}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send to {shareToName ?? "this tailor"} on WhatsApp
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyRecord} onOpenChange={(open) => !open && setHistoryRecord(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Measurement history</DialogTitle>
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
          {record.relation === "guardian" ? `For ${record.full_name}` : "You"}
        </p>
        <p className="text-xs text-muted-foreground">{record.store_name}</p>
      </div>

      {!latest ? (
        <p className="mt-3 text-sm text-muted-foreground">No measurements recorded here yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Taken {new Date(latest.taken_at).toLocaleDateString()}
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
              {changed} measurement{changed === 1 ? "" : "s"} changed since{" "}
              {previous ? new Date(previous.taken_at).toLocaleDateString() : ""}
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
  if (record.versions.length <= 1) {
    return (
      <p className="text-sm text-muted-foreground">First measurement, nothing to compare yet.</p>
    );
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
                <p className="text-sm text-muted-foreground">No meaningful changes.</p>
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
          <span className="text-muted-foreground">{change.newDisplay} (added)</span>
        ) : change.status === "removed" ? (
          <span className="text-muted-foreground">{change.oldDisplay} (removed)</span>
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
  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
      <div>
        <p>Created {new Date(share.created_at).toLocaleDateString()}</p>
        <p className="text-xs text-muted-foreground">
          {share.revoked_at
            ? "Turned off"
            : share.used_by_store_name
              ? `Used by ${share.used_by_store_name}`
              : "Not used yet"}
        </p>
      </div>
      {!share.revoked_at && (
        <Button size="sm" variant="ghost" className="text-owed" onClick={onRevoke}>
          <ShieldOff className="size-4" />
          Revoke
        </Button>
      )}
    </div>
  );
}
