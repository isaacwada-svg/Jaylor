import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { InviteStaffForm } from "@/components/jaylor/invite-staff-form";
import { FeatureLimitSheet } from "@/components/jaylor/feature-limit-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { effectiveTier, STAFF_LIMITS, ORDER_STATUSES_DB, orderStatusLabel } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/staff")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Staff and job board — Jaylor" },
      {
        name: "description",
        content: "Assign work, see workload, and manage your team's roles.",
      },
    ],
  }),
  component: Staff,
});

const BOARD_STATUSES = ORDER_STATUSES_DB.filter((s) => s !== "collected");

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function Staff() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canManage = currentRole === "owner" || currentRole === "manager";
  const isOwner = currentRole === "owner";
  const queryClient = useQueryClient();
  const tier = effectiveTier(currentStore);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [limitSheetOpen, setLimitSheetOpen] = useState(false);
  const [tailorFilter, setTailorFilter] = useState<string>("all");

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["store-members", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_members")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.user_id), [members]);
  const { data: profiles } = useQuery({
    queryKey: ["staff-profiles", memberUserIds],
    enabled: memberUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", memberUserIds);
      if (error) throw error;
      return data;
    },
  });
  const profileById = (userId: string) => profiles?.find((p) => p.id === userId);

  const { data: invites } = useQuery({
    queryKey: ["store-invites", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_invites")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["staff-orders", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", storeId as string)
        .neq("status", "cancelled")
        .order("delivery_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: myOrders } = useQuery({
    queryKey: ["staff-my-orders", storeId],
    enabled: !!storeId && !canManage,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("orders_for_tailor")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("assigned_to", userData.user?.id as string);
      if (error) throw error;
      return data;
    },
  });

  const clientIds = useMemo(() => [...new Set((orders ?? []).map((o) => o.client_id))], [orders]);
  const { data: clients } = useQuery({
    queryKey: ["staff-orders-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientFirstName = (id: string) => {
    const full = clients?.find((c) => c.id === id)?.full_name ?? "";
    return full.split(" ")[0] || "Client";
  };

  const tailors = (members ?? []).filter((m) => m.role === "tailor");
  const activeCount = members?.length ?? 0;
  const staffLimit = STAFF_LIMITS[tier];

  function invalidateMembers() {
    queryClient.invalidateQueries({ queryKey: ["store-members", storeId] });
  }
  function invalidateInvites() {
    queryClient.invalidateQueries({ queryKey: ["store-invites", storeId] });
  }
  function invalidateOrders() {
    queryClient.invalidateQueries({ queryKey: ["staff-orders", storeId] });
  }

  function openInvite() {
    if (activeCount >= staffLimit) {
      setLimitSheetOpen(true);
      return;
    }
    setInviteOpen(true);
  }

  async function changeRole(memberId: string, role: "manager" | "tailor") {
    try {
      const { error } = await supabase.from("store_members").update({ role }).eq("id", memberId);
      if (error) throw error;
      invalidateMembers();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this role"));
    }
  }

  async function removeMember(memberId: string) {
    try {
      const { error } = await supabase
        .from("store_members")
        .update({ status: "removed" })
        .eq("id", memberId);
      if (error) throw error;
      toast.success("Removed from your team");
      invalidateMembers();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this person"));
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      const { error } = await supabase
        .from("store_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId);
      if (error) throw error;
      invalidateInvites();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not revoke this invite"));
    }
  }

  async function assignTailor(orderId: string, tailorId: string | null) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_to: tailorId })
        .eq("id", orderId);
      if (error) throw error;
      invalidateOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not assign this job"));
    }
  }

  async function advanceStatus(orderId: string, currentStatus: string) {
    const index = BOARD_STATUSES.indexOf(currentStatus as (typeof BOARD_STATUSES)[number]);
    const next = index >= 0 ? ORDER_STATUSES_DB[index + 1] : undefined;
    if (!next) return;
    try {
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId);
      if (error) throw error;
      invalidateOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not move this job"));
    }
  }

  const filteredOrders = (orders ?? []).filter((o) => {
    if (tailorFilter === "all") return true;
    if (tailorFilter === "unassigned") return !o.assigned_to;
    return o.assigned_to === tailorFilter;
  });

  const today = startOfToday();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthStart = startOfMonth();

  const workload = tailors.map((tailor) => {
    const jobs = (orders ?? []).filter((o) => o.assigned_to === tailor.user_id);
    const active = jobs.filter((o) => o.status !== "collected");
    const dueThisWeek = active.filter((o) => {
      if (!o.delivery_date) return false;
      const due = new Date(o.delivery_date);
      return due >= today && due <= weekAhead;
    });
    const overdue = active.filter((o) => o.delivery_date && new Date(o.delivery_date) < today);
    const completedThisMonth = jobs.filter(
      (o) => o.status === "collected" && o.collected_at && new Date(o.collected_at) >= monthStart,
    );
    return {
      tailor,
      active: active.length,
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length,
      completedThisMonth: completedThisMonth.length,
    };
  });

  if (!canManage) {
    const active = (myOrders ?? []).filter((o) => o.status !== "collected");
    const dueThisWeek = active.filter(
      (o) =>
        !!o.delivery_date &&
        new Date(o.delivery_date) >= today &&
        new Date(o.delivery_date) <= weekAhead,
    );
    const overdue = active.filter((o) => !!o.delivery_date && new Date(o.delivery_date) < today);

    return (
      <AppShell>
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8 lg:py-10">
          <h1 className="text-3xl">My workload</h1>
          <StitchDivider className="my-6" />
          <p className="text-sm text-muted-foreground">
            See your assigned jobs and money-free job details from Home.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Active jobs" value={active.length} />
            <Stat label="Due this week" value={dueThisWeek.length} />
            <Stat label="Overdue" value={overdue.length} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Staff and job board</h1>
        <StitchDivider className="my-6" />

        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board">Job board</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="workload">Workload</TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={tailorFilter} onValueChange={setTailorFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tailors</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {tailors.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {profileById(t.user_id)?.full_name ?? "Tailor"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ordersLoading ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {BOARD_STATUSES.map((status) => {
                  const columnOrders = filteredOrders.filter((o) => o.status === status);
                  return (
                    <div key={status} className="w-64 shrink-0">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-sm font-medium">{orderStatusLabel(status)}</p>
                        <Badge variant="outline">{columnOrders.length}</Badge>
                      </div>
                      <div className="mt-2 space-y-2">
                        {columnOrders.map((order) => {
                          const overdue =
                            !!order.delivery_date && new Date(order.delivery_date) < today;
                          return (
                            <div key={order.id} className="rounded-xl border border-border p-3">
                              <p className="truncate text-sm font-medium">
                                {clientFirstName(order.client_id)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {order.garment_type}
                              </p>
                              <p
                                className={`mt-1 text-xs ${overdue ? "text-owed" : "text-muted-foreground"}`}
                              >
                                {order.delivery_date
                                  ? new Date(order.delivery_date).toLocaleDateString()
                                  : "No date"}
                              </p>
                              <Select
                                value={order.assigned_to ?? "none"}
                                onValueChange={(v) =>
                                  assignTailor(order.id, v === "none" ? null : v)
                                }
                              >
                                <SelectTrigger className="mt-2 h-8 text-xs">
                                  <SelectValue placeholder="Assign" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Unassigned</SelectItem>
                                  {tailors.map((t) => (
                                    <SelectItem key={t.user_id} value={t.user_id}>
                                      {profileById(t.user_id)?.full_name ?? "Tailor"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {status !== "ready" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="mt-1 h-7 w-full text-xs"
                                  onClick={() => advanceStatus(order.id, order.status)}
                                >
                                  Move on
                                  <ArrowRight className="size-3" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <div className="flex justify-end">
              <Button size="sm" onClick={openInvite}>
                <Plus className="size-4" />
                Invite
              </Button>
            </div>

            {membersLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {(members ?? []).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {profileById(member.user_id)?.full_name ?? "Team member"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {profileById(member.user_id)?.phone ?? ""}
                      </p>
                    </div>
                    {member.role === "owner" ? (
                      <Badge variant="outline" className="border-gold text-gold">
                        Owner
                      </Badge>
                    ) : isOwner ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(v) => changeRole(member.id, v as "manager" | "tailor")}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="tailor">Tailor</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => removeMember(member.id)}>
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline">{member.role}</Badge>
                    )}
                  </div>
                ))}

                {invites && invites.length > 0 && (
                  <>
                    <p className="mt-6 text-sm font-medium text-muted-foreground">
                      Pending invites
                    </p>
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {invite.email || invite.phone || "Invite"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {invite.role} · expires{" "}
                            {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => revokeInvite(invite.id)}>
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="workload" className="mt-6">
            {tailors.length === 0 ? (
              <EmptyState
                title="No tailors yet"
                description="Invite a tailor to your team to see their workload here."
              />
            ) : (
              <div className="space-y-3">
                {workload.map(({ tailor, active, dueThisWeek, overdue, completedThisMonth }) => (
                  <div key={tailor.id} className="rounded-2xl border border-border p-4">
                    <p className="font-medium">
                      {profileById(tailor.user_id)?.full_name ?? "Tailor"}
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <Stat label="Active" value={active} />
                      <Stat label="Due this week" value={dueThisWeek} />
                      <Stat label="Overdue" value={overdue} />
                      <Stat label="Done this month" value={completedThisMonth} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {storeId && (
        <InviteStaffForm
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          storeId={storeId}
          onSaved={invalidateInvites}
        />
      )}
      <FeatureLimitSheet
        open={limitSheetOpen}
        onOpenChange={setLimitSheetOpen}
        requiredTier={tier === "Free" ? "Growth" : "Business"}
        message={`You've reached the ${staffLimit === Infinity ? "" : staffLimit + " "}team member limit on your plan.`}
      />
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-2 text-center">
      <p className="figures text-lg">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
