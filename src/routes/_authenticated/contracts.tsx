import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { EventForm } from "@/components/jaylor/event-form";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { formatMoney } from "@/lib/jaylor";
import { computeQuoteTotals } from "@/lib/quote";
import { jobTemplate } from "@/lib/job-templates";
import { useJobTemplates } from "@/lib/use-job-templates";

export const Route = createFileRoute("/_authenticated/contracts")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Contracts — Jaylor" },
      {
        name: "description",
        content: "School, company and other single-payer jobs, with value, deposit and balance.",
      },
    ],
  }),
  component: Contracts,
});

function Contracts() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canCreate = currentRole === "owner" || currentRole === "manager";
  const { data: storeTemplates } = useJobTemplates(storeId);
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["contracts", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("payer_mode", "single_payer")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const jobIds = useMemo(() => (jobs ?? []).map((j) => j.id), [jobs]);
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ["contracts-participants", jobIds],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select("event_id, paid_amount")
        .in("event_id", jobIds);
      if (error) throw error;
      return data;
    },
  });

  const paidByJob = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of participants ?? []) {
      map[p.event_id] = (map[p.event_id] ?? 0) + p.paid_amount;
    }
    return map;
  }, [participants]);

  const isLoading = jobsLoading || participantsLoading;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Contracts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              School, company and other single-payer jobs — value, deposit status and balance.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)} className="shrink-0">
              <Plus className="size-4" />
              New contract
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState
            title="No contracts yet"
            description="School uniforms, company uniforms and other single-payer jobs will show up here once you create one."
            action={
              canCreate ? (
                <Button onClick={() => setFormOpen(true)}>New contract</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const value =
                job.quantity != null && job.price_per_person != null
                  ? computeQuoteTotals(
                      job.quantity,
                      job.price_per_person,
                      job.vat_enabled,
                      job.vat_percent,
                    ).total
                  : (job.price_per_person ?? 0);
              const paid = paidByJob[job.id] ?? 0;
              const balance = Math.max(0, value - paid);
              const depositDue = job.deposit_percent
                ? Math.round(value * (job.deposit_percent / 100))
                : null;
              const depositStatus =
                job.stage === "quote"
                  ? "Awaiting acceptance"
                  : depositDue != null && paid < depositDue
                    ? "Deposit pending"
                    : "Deposit paid";

              return (
                <Link
                  key={job.id}
                  to="/events/$eventId"
                  params={{ eventId: job.id }}
                  className="block rounded-2xl border border-border p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {jobTemplate(job.job_type, storeTemplates).label}
                        {job.organiser_name ? ` · ${job.organiser_name}` : ""}
                      </p>
                      {job.delivery_date && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          Delivery {new Date(job.delivery_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        depositStatus === "Deposit paid"
                          ? "sm:shrink-0 border-paid/40 text-paid"
                          : "sm:shrink-0 border-gold text-gold"
                      }
                    >
                      {depositStatus}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Value</p>
                      <p className="figures font-medium">{formatMoney(value)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="figures font-medium text-paid">{formatMoney(paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="figures font-medium text-owed">{formatMoney(balance)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {storeId && (
        <EventForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          templateFilter={(t) => t.isContract}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["contracts", storeId] });
          }}
        />
      )}
    </AppShell>
  );
}
