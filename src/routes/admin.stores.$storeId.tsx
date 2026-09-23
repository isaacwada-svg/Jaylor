import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { formatMoney, orderStatusLabel, planCodeToTier } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/admin/stores/$storeId")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({ meta: [{ title: "Store detail — Jaylor admin" }] }),
  component: StoreDetail,
});

// Admin RPCs aren't in the generated Database types yet, same as admin.tsx.
const rpcAdmin = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
// clients/orders/payments/store_members are typed tables, but the new
// platform_admin_select_* RLS policies aren't reflected until types.ts is
// regenerated -- narrow cast at the query boundary, same pattern used for
// advisor_threads/notifications this session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from(table: string): any };

type StoreDetailData = {
  store: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    country_code: string;
    currency: string;
    plan_code: string;
    trial_ends_at: string;
    is_active: boolean;
    created_at: string;
    whatsapp_phone: string | null;
  };
  owner: { id: string; email: string | null; full_name: string | null };
  staff: {
    id: string;
    user_id: string;
    role: string;
    status: string;
    email: string | null;
    full_name: string | null;
    created_at: string;
  }[];
  totals: {
    clients_count: number;
    orders_count: number;
    active_orders_count: number;
    collected_total: number;
    outstanding_total: number;
  };
};

type OrderRow = {
  id: string;
  garment_type: string;
  status: string;
  price: number | null;
  delivery_date: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string | null;
  paid_at: string;
  voided: boolean;
};

function useAdminGate() {
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

  return { ready: authChecked && !adminCheckLoading, isAdmin: !!isAdmin };
}

function StoreDetail() {
  const { storeId } = Route.useParams();
  const { ready, isAdmin } = useAdminGate();

  if (!ready) return <div className="min-h-screen bg-background" />;

  if (!isAdmin) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-xl">You don&apos;t have access to this page</h1>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/dashboard">Back to your workroom</Link>
        </Button>
      </main>
    );
  }

  return <StoreDetailContent storeId={storeId} />;
}

function StoreDetailContent({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-store-detail", storeId],
    queryFn: async () => {
      const { data, error } = await rpcAdmin("admin_get_store_detail", { p_store_id: storeId });
      if (error) throw error;
      return data as unknown as StoreDetailData;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["admin-plan-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("code, name").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-store-orders", storeId],
    queryFn: async () => {
      const { data, error } = await db
        .from("orders")
        .select("id, garment_type, status, price, delivery_date, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as OrderRow[];
    },
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["admin-store-payments", storeId],
    queryFn: async () => {
      const { data, error } = await db
        .from("payments")
        .select("id, amount, method, paid_at, voided")
        .eq("store_id", storeId)
        .order("paid_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as PaymentRow[];
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-store-detail", storeId] });
    queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
  }

  async function savePlan() {
    if (!selectedPlan) return;
    setBusy(true);
    try {
      const { error } = await rpcAdmin("admin_set_store_plan", {
        p_store_id: storeId,
        p_plan_code: selectedPlan,
      });
      if (error) throw error;
      toast.success("Plan updated");
      setPlanDialogOpen(false);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update plan"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!data) return;
    const next = !data.store.is_active;
    if (!window.confirm(next ? "Reactivate this store?" : "Deactivate this store?")) return;
    setBusy(true);
    try {
      const { error } = await rpcAdmin("admin_set_store_active", {
        p_store_id: storeId,
        p_is_active: next,
      });
      if (error) throw error;
      toast.success(next ? "Store reactivated" : "Store deactivated");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update this store"));
    } finally {
      setBusy(false);
    }
  }

  async function extendTrial() {
    const days = Number(trialDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Enter a valid number of days");
      return;
    }
    setBusy(true);
    try {
      const { error } = await rpcAdmin("admin_extend_trial", {
        p_store_id: storeId,
        p_days: days,
      });
      if (error) throw error;
      toast.success(`Trial extended by ${days} days`);
      setTrialDialogOpen(false);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not extend trial"));
    } finally {
      setBusy(false);
    }
  }

  async function removeStaffMember(memberId: string) {
    if (!window.confirm("Remove this team member from the store?")) return;
    try {
      const { error } = await rpcAdmin("admin_remove_staff_member", { p_member_id: memberId });
      if (error) throw error;
      toast.success("Team member removed");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not remove this member"));
    }
  }

  return (
    <main className="linen min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandLogo markClassName="h-10 w-auto" />
            <span className="border-l border-border pl-3 text-sm font-medium text-muted-foreground">
              Platform admin
            </span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="size-4" />
              Back to admin
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">Could not load this store.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl">{data.store.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  jaylor.ng/{data.store.slug} {data.store.city ? `· ${data.store.city}` : ""} ·{" "}
                  {data.store.country_code}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TierBadge tier={planCodeToTier(data.store.plan_code)} />
                {!data.store.is_active && <Badge variant="outline">Inactive</Badge>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedPlan(data.store.plan_code);
                  setPlanDialogOpen(true);
                }}
              >
                Change plan
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTrialDialogOpen(true)}>
                Extend trial
              </Button>
              <Button size="sm" variant="outline" onClick={toggleActive} disabled={busy}>
                {data.store.is_active ? "Deactivate store" : "Reactivate store"}
              </Button>
            </div>

            <StitchDivider className="my-6" />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Clients" value={String(data.totals.clients_count)} />
              <Stat
                label="Orders"
                value={`${data.totals.orders_count} (${data.totals.active_orders_count} active)`}
              />
              <Stat label="Collected" value={formatMoney(data.totals.collected_total)} />
              <Stat label="Outstanding" value={formatMoney(data.totals.outstanding_total)} />
            </div>

            <h2 className="mt-8 text-xl">Owner</h2>
            <Card className="mt-3 rounded-2xl">
              <CardContent className="p-4">
                <p className="font-medium">{data.owner.full_name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{data.owner.email}</p>
                {data.store.whatsapp_phone && (
                  <p className="text-sm text-muted-foreground">{data.store.whatsapp_phone}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Trial ends {new Date(data.store.trial_ends_at).toLocaleDateString()} · Created{" "}
                  {new Date(data.store.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>

            <h2 className="mt-8 text-xl">Staff</h2>
            {data.staff.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No staff members.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.staff.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.full_name ?? member.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email} · {member.role}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{member.status}</Badge>
                      {member.role !== "owner" && member.status !== "removed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeStaffMember(member.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="mt-8 text-xl">Recent orders</h2>
            {ordersLoading ? (
              <Skeleton className="mt-3 h-24 rounded-xl" />
            ) : !orders || orders.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                  >
                    <span>{order.garment_type}</span>
                    <span className="text-muted-foreground">{orderStatusLabel(order.status)}</span>
                    <span className="figures">{formatMoney(order.price ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}

            <h2 className="mt-8 text-xl">Recent payments</h2>
            {paymentsLoading ? (
              <Skeleton className="mt-3 h-24 rounded-xl" />
            ) : !payments || payments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                  >
                    <span>{new Date(payment.paid_at).toLocaleDateString()}</span>
                    <span className="text-muted-foreground">{payment.method ?? "—"}</span>
                    <span className="figures">
                      {formatMoney(payment.amount)}
                      {payment.voided && " (voided)"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>This takes effect immediately.</DialogDescription>
          </DialogHeader>
          <Select value={selectedPlan} onValueChange={setSelectedPlan}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {(plans ?? []).map((plan) => (
                <SelectItem key={plan.code} value={plan.code}>
                  {plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={savePlan} disabled={busy || !selectedPlan} className="w-full">
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial</DialogTitle>
            <DialogDescription>
              Adds days to the trial, measured from today or the current trial end, whichever is
              later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="trial-days">Days to add</Label>
            <Input
              id="trial-days"
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={extendTrial} disabled={busy} className="w-full">
              {busy ? "Saving..." : "Extend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
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
