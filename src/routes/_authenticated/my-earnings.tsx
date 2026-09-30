import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyText } from "@/components/jaylor/money-text";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { useOnlineStatus } from "@/lib/use-online-status";
import { STAGE_LABELS } from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/my-earnings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "My earnings — Jaylor" },
      { name: "description", content: "Your piece-rate earnings and payroll history." },
    ],
  }),
  component: MyEarnings,
});

const STATUS_LABEL: Record<string, string> = {
  earned: "Earned",
  needs_rate: "Awaiting rate",
  unassigned: "Unassigned",
  voided: "Voided",
};

function MyEarnings() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const online = useOnlineStatus();

  const { data: earnings, isLoading } = useQuery({
    queryKey: ["my-earnings", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("staff_earnings")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("member_ref", userData.user?.id as string)
        .order("earned_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ["my-payroll-lines", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("payroll_lines")
        .select("*, payroll_runs(period_start, period_end, status)")
        .eq("store_id", storeId as string)
        .eq("member_ref", userData.user?.id as string)
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">My earnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What you've earned per garment and stage, and past payroll.
        </p>
        <StitchDivider className="my-6" />

        {!online && <OfflineNotice label="Earnings need a connection to load." />}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        ) : !earnings || earnings.length === 0 ? (
          <EmptyState
            title="No earnings yet"
            description="Earnings show up here as orders move through their stages."
          />
        ) : (
          <div className="space-y-2">
            {earnings.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {STAGE_LABELS[e.stage as keyof typeof STAGE_LABELS] ?? e.stage}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.earned_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="figures font-medium">
                    <MoneyText amount={e.amount} />
                  </p>
                  {e.status !== "earned" && (
                    <Badge variant="secondary" className="mt-0.5">
                      {STATUS_LABEL[e.status] ?? e.status}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {lines && lines.length > 0 && (
          <>
            <StitchDivider className="my-6" />
            <h2 className="text-xl">Payroll history</h2>
            <div className="mt-3 space-y-2">
              {lines.map((line) => {
                const run = line.payroll_runs as {
                  period_start: string;
                  period_end: string;
                  status: string;
                } | null;
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {run
                          ? `${new Date(run.period_start).toLocaleDateString()} – ${new Date(run.period_end).toLocaleDateString()}`
                          : "Payroll run"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {line.jobs_count} {line.jobs_count === 1 ? "job" : "jobs"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="figures font-medium">
                        <MoneyText amount={line.net} />
                      </p>
                      <Badge
                        variant="secondary"
                        className={run?.status === "paid" ? "bg-paid/15 text-paid" : undefined}
                      >
                        {run?.status === "paid" ? "Paid" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
