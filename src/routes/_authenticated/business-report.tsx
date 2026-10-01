import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addMonths, parse, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Copy, Download, Share2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { TierBadge } from "@/components/jaylor/tier-badge";
import {
  BusinessReportDocument,
  type HealthReport,
} from "@/components/jaylor/business-report-document";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useHealthReportAccess } from "@/lib/use-health-report-access";
import { useOnlineStatus } from "@/lib/use-online-status";
import { planCodeToTier } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

// These report RPCs aren't in the generated Database types yet. Must stay
// a call on `supabase` itself, not a bare extracted reference --
// supabase.rpc() reads `this.rest` internally, so aliasing it directly
// loses that binding and throws "Cannot read properties of undefined
// (reading 'rest')".
function rpcReport(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return supabase.rpc(fn as never, args as never) as unknown as Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export const Route = createFileRoute("/_authenticated/business-report")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Business report — Jaylor" },
      {
        name: "description",
        content:
          "A monthly summary of the shop's money, profit, work and clients, shareable with a lender or partner.",
      },
    ],
  }),
  component: BusinessReportPage,
});

type ReportShare = {
  id: string;
  period_month: string;
  token: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
};

function BusinessReportPage() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const canManage = currentRole === "owner" || currentRole === "manager";
  const isOwner = currentRole === "owner";

  const [monthValue, setMonthValue] = useState(() => format(new Date(), "yyyy-MM"));
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");
  const [creatingShare, setCreatingShare] = useState(false);

  const { data: access, isLoading: accessLoading } = useHealthReportAccess(storeId);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["business-health-report", storeId, monthValue],
    enabled: !!storeId && canManage && !!access && online,
    queryFn: async () => {
      const { data, error } = await rpcReport("get_business_health_report", {
        p_store_id: storeId as string,
        p_period_month: monthValue,
      });
      if (error) throw error;
      return data as unknown as HealthReport;
    },
  });

  const { data: shares, isLoading: sharesLoading } = useQuery({
    queryKey: ["report-shares", storeId],
    enabled: !!storeId && isOwner && online,
    queryFn: async () => {
      const { data, error } = await rpcReport("list_report_shares", {
        p_store_id: storeId as string,
      });
      if (error) throw error;
      return data as unknown as ReportShare[];
    },
  });

  async function createShare() {
    if (!storeId) return;
    setCreatingShare(true);
    try {
      const { error } = await rpcReport("create_report_share", {
        p_store_id: storeId,
        p_period_month: monthValue,
        p_expires_days: Number(expiryDays),
      });
      if (error) throw error;
      toast.success("Share link created");
      queryClient.invalidateQueries({ queryKey: ["report-shares", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create a share link"));
    } finally {
      setCreatingShare(false);
    }
  }

  async function revokeShare(shareId: string) {
    if (!storeId) return;
    try {
      const { error } = await rpcReport("revoke_report_share", {
        p_store_id: storeId,
        p_share_id: shareId,
      });
      if (error) throw error;
      toast.success("Link revoked");
      queryClient.invalidateQueries({ queryKey: ["report-shares", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not revoke this link"));
    }
  }

  function copyShareLink(token: string) {
    const url = `${window.location.origin}/r/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy"));
  }

  if (!canManage) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title="Not available"
            description="The business report is managed by the owner and managers of your store."
          />
        </div>
      </AppShell>
    );
  }

  if (accessLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!access) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title="Upgrade to unlock the business report"
            description="A monthly summary of money, profit, work and clients -- share a read-only copy with a lender or partner. Available on the Business plan and above (or during your trial)."
            action={
              <div className="flex flex-col items-center gap-2">
                <TierBadge tier={planCodeToTier("business")} />
                <Button onClick={() => toast("Billing isn't set up yet — coming soon")}>
                  Upgrade to Business
                </Button>
              </div>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl">Business report</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A monthly summary to understand the business, or share with a lender or partner.{" "}
              <Link to="/reports" className="underline">
                Back to Reports
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setMonthValue(
                  format(subMonths(parse(monthValue, "yyyy-MM", new Date()), 1), "yyyy-MM"),
                )
              }
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setMonthValue(
                  format(addMonths(parse(monthValue, "yyyy-MM", new Date()), 1), "yyyy-MM"),
                )
              }
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {!online && (
          <div className="mt-4">
            <OfflineNotice label="The business report needs an internet connection." />
          </div>
        )}

        {online && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()} disabled={!report}>
              <Download className="size-4" />
              Download PDF
            </Button>
            {isOwner && (
              <Button variant="outline" onClick={() => setShareDialogOpen(true)} disabled={!report}>
                <Share2 className="size-4" />
                Share with a lender or partner
              </Button>
            )}
          </div>
        )}
      </div>

      {online && reportLoading && (
        <div className="mx-auto w-full max-w-4xl px-4 lg:px-8">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      )}

      {online && report && <BusinessReportDocument report={report} id="jaylor-business-report" />}

      {isOwner && online && (
        <div className="mx-auto mt-8 w-full max-w-4xl px-4 pb-10 lg:px-8 print:hidden">
          <h2 className="text-xl">Active share links</h2>
          {sharesLoading ? (
            <Skeleton className="mt-3 h-16 rounded-xl" />
          ) : !shares || shares.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No share links created yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {shares.map((share) => {
                const revoked = !!share.revoked_at;
                const expired = !revoked && new Date(share.expires_at) <= new Date();
                return (
                  <div
                    key={share.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{share.period_month}</p>
                      <p className="text-xs text-muted-foreground">
                        {revoked
                          ? "Revoked"
                          : expired
                            ? "Expired"
                            : `Expires ${new Date(share.expires_at).toLocaleDateString()}`}
                        {" · "}
                        {share.view_count} view{share.view_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!revoked && !expired && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyShareLink(share.token)}
                        >
                          <Copy className="size-4" />
                          Copy link
                        </Button>
                      )}
                      {!revoked && (
                        <Button size="sm" variant="ghost" onClick={() => revokeShare(share.id)}>
                          <Trash2 className="size-4" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {monthValue} with a lender or partner</DialogTitle>
            <DialogDescription>
              Freezes this month's figures into a read-only link. Client names are replaced with
              "Client A", "Client B" and so on -- your own view always shows real names.
            </DialogDescription>
          </DialogHeader>
          <Select value={expiryDays} onValueChange={setExpiryDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Expires in 1 day</SelectItem>
              <SelectItem value="7">Expires in 7 days</SelectItem>
              <SelectItem value="30">Expires in 30 days</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              onClick={async () => {
                await createShare();
                setShareDialogOpen(false);
              }}
              disabled={creatingShare}
              className="w-full"
            >
              {creatingShare ? "Creating..." : "Create share link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-business-report, #jaylor-business-report * { visibility: visible; }
          #jaylor-business-report { position: fixed; inset: 0 auto auto 0; width: 100%; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </AppShell>
  );
}
