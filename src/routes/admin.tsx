import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { formatMoney, planCodeToTier } from "@/lib/jaylor";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Platform admin — Jaylor" }] }),
  component: Admin,
});

type StoreRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  plan_code: string;
  effective_plan: string;
  trial_ends_at: string;
  is_active: boolean;
  created_at: string;
};

type Stats = {
  total_stores: number;
  new_stores_30d: number;
  trials_ending_7d: number;
  active_this_week: number;
  stores_by_plan: Record<string, number>;
  mrr_estimate: number;
};

type PlanRow = {
  code: string;
  name: string;
  currency: string;
  price_monthly: number | null;
  price_quarterly: number | null;
  limits: Json;
  features: Json;
  sort_order: number;
};

type AuditRow = {
  id: string;
  store_id: string | null;
  store_name: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function Admin() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setSignedIn(true);
      setAuthChecked(true);
    });
  }, [navigate]);

  const { data: isAdmin, isLoading: adminCheckLoading } = useQuery({
    queryKey: ["is-platform-admin"],
    enabled: signedIn,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return data;
    },
  });

  if (!authChecked || adminCheckLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAdmin) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-xl">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is for Bethjay platform staff only.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/dashboard">Back to your workroom</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="linen min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-heading text-primary-foreground">
              J
            </span>
            <span className="font-heading text-lg">Platform admin</span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Exit admin</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <PlansTab />
          </TabsContent>
          <TabsContent value="leads" className="mt-6">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="audit" className="mt-6">
            <AuditTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function OverviewTab() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const { data: stores, isLoading: storesLoading } = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_stores");
      if (error) throw error;
      return data as unknown as StoreRow[];
    },
  });

  return (
    <div>
      {statsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total stores" value={String(stats.total_stores)} />
          <Stat label="New in 30 days" value={String(stats.new_stores_30d)} />
          <Stat label="Trials ending in 7 days" value={String(stats.trials_ending_7d)} />
          <Stat label="Active this week" value={String(stats.active_this_week)} />
          <Stat label="Estimated MRR" value={formatMoney(stats.mrr_estimate)} />
          {Object.entries(stats.stores_by_plan).map(([plan, count]) => (
            <Stat key={plan} label={`On ${planCodeToTier(plan)}`} value={String(count)} />
          ))}
        </div>
      ) : null}

      <h2 className="mt-8 text-xl">Stores</h2>
      {storesLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {(stores ?? []).map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{store.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  jaylor.ng/{store.slug} {store.city ? `· ${store.city}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TierBadge tier={planCodeToTier(store.effective_plan)} />
                {!store.is_active && <Badge variant="outline">Inactive</Badge>}
                <span className="text-xs text-muted-foreground">
                  {new Date(store.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="figures mt-2 text-xl">{value}</p>
      </CardContent>
    </Card>
  );
}

function PlansTab() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [priceMonthly, setPriceMonthly] = useState("");
  const [priceQuarterly, setPriceQuarterly] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data as unknown as PlanRow[];
    },
  });

  function openEdit(plan: PlanRow) {
    setEditingPlan(plan);
    setPriceMonthly(plan.price_monthly != null ? String(plan.price_monthly) : "");
    setPriceQuarterly(plan.price_quarterly != null ? String(plan.price_quarterly) : "");
  }

  async function savePlan() {
    if (!editingPlan) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_update_plan", {
        p_code: editingPlan.code,
        p_name: editingPlan.name,
        p_price_monthly: priceMonthly.trim() ? Number(priceMonthly) : null,
        p_price_quarterly: priceQuarterly.trim() ? Number(priceQuarterly) : null,
        p_limits: editingPlan.limits,
        p_features: editingPlan.features,
      });
      if (error) throw error;
      toast.success("Plan updated");
      setEditingPlan(null);
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this plan"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(plans ?? []).map((plan) => (
        <div
          key={plan.code}
          className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
        >
          <div>
            <p className="font-medium">{plan.name}</p>
            <p className="text-sm text-muted-foreground">
              {plan.price_monthly ? `${formatMoney(plan.price_monthly)}/mo` : "—"}
              {plan.price_quarterly ? ` · ${formatMoney(plan.price_quarterly)}/quarter` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
            Edit
          </Button>
        </div>
      ))}

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingPlan?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-monthly">Monthly price (₦)</Label>
              <Input
                id="plan-monthly"
                type="number"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-quarterly">Quarterly price (₦)</Label>
              <Input
                id="plan-quarterly"
                type="number"
                value={priceQuarterly}
                onChange={(e) => setPriceQuarterly(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>
              Cancel
            </Button>
            <Button onClick={savePlan} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadsTab() {
  const { data: leads, isLoading } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return <p className="text-sm text-muted-foreground">No leads yet.</p>;
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <div key={lead.id} className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">{lead.name}</p>
            <span className="text-xs text-muted-foreground">
              {new Date(lead.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[lead.phone, lead.email].filter(Boolean).join(" · ") || "No contact given"}
          </p>
          {lead.message && <p className="mt-2 text-sm">{lead.message}</p>}
        </div>
      ))}
    </div>
  );
}

function AuditTab() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_audit_logs", { p_limit: 200 });
      if (error) throw error;
      return data as unknown as AuditRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(logs ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        (logs ?? []).map((log) => (
          <div key={log.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.action}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {log.actor_name ?? "System"}
              {log.store_name ? ` · ${log.store_name}` : ""}
              {log.entity ? ` · ${log.entity}` : ""}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
