import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { MoneyText } from "@/components/jaylor/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
import { useFeature } from "@/lib/use-feature";
import { useOnlineStatus } from "@/lib/use-online-status";
import { GARMENT_TYPES, GARMENT_TYPE_CODE_BY_NAME, planCodeToTier } from "@/lib/jaylor";
import {
  PAYROLL_STAGES,
  STAGE_LABELS,
  buildPayrollCsv,
  currentPayrollWeek,
  formatPeriodLabel,
  shiftPayrollWeek,
  type PayrollWarning,
} from "@/lib/payroll";
import { getErrorMessage } from "@/lib/utils";
import { useAppT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/_authenticated/payroll")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Staff payroll — Jaylor" },
      { name: "description", content: "Piece-rate pay per garment or stage, and weekly payroll." },
    ],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const t = useAppT("app_payroll");
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const isOwner = currentRole === "owner";
  const canManage = currentRole === "owner" || currentRole === "manager";
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  const { data: feature, isLoading: featureLoading } = useFeature(storeId, "payroll");
  const [period, setPeriod] = useState(() => currentPayrollWeek());

  const { data: members } = useQuery({
    queryKey: ["payroll-members", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_members")
        .select("user_id, role")
        .eq("store_id", storeId as string)
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });
  const memberIds = useMemo(() => (members ?? []).map((m) => m.user_id), [members]);
  const { data: profiles } = useQuery({
    queryKey: ["payroll-profiles", memberIds],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberIds);
      if (error) throw error;
      return data;
    },
  });
  const nameByMember = (memberRef: string | null) =>
    (memberRef && profiles?.find((p) => p.id === memberRef)?.full_name) ||
    t("unassigned") ||
    "Unassigned";

  const { data: rates } = useQuery({
    queryKey: ["pay-rates", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_rates")
        .select("*")
        .eq("store_id", storeId as string);
      if (error) throw error;
      return data;
    },
  });
  const rateFor = (garmentTypeCode: string, stage: string) =>
    rates?.find((r) => r.garment_type_code === garmentTypeCode && r.stage === stage);

  const { data: needsAttention } = useQuery({
    queryKey: ["payroll-needs-attention", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_earnings")
        .select("*")
        .eq("store_id", storeId as string)
        .in("status", ["needs_rate", "unassigned"])
        .is("payroll_run_id", null)
        .order("earned_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: advances } = useQuery({
    queryKey: ["payroll-advances", storeId],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_advances")
        .select("*")
        .eq("store_id", storeId as string)
        .is("payroll_run_id", null)
        .order("given_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: warnings } = useQuery({
    queryKey: ["payroll-period-warnings", storeId, period.start, period.end],
    enabled: !!storeId && canManage && online,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payroll_period_warnings", {
        p_store_id: storeId as string,
        p_period_start: period.start,
        p_period_end: period.end,
      });
      if (error) throw error;
      return (data ?? []) as PayrollWarning[];
    },
  });

  const { data: run } = useQuery({
    queryKey: ["payroll-run", storeId, period.start, period.end],
    enabled: !!storeId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("period_start", period.start)
        .eq("period_end", period.end)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ["payroll-lines", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_lines")
        .select("*")
        .eq("run_id", run?.id as string);
      if (error) throw error;
      return data;
    },
  });

  function invalidatePayroll() {
    queryClient.invalidateQueries({ queryKey: ["pay-rates", storeId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-needs-attention", storeId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-advances", storeId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-period-warnings", storeId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-run", storeId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-lines"] });
  }

  async function saveRate(garmentTypeCode: string, stage: string, amount: number) {
    if (!storeId) return;
    try {
      const { error } = await supabase.rpc("upsert_pay_rate", {
        p_store_id: storeId,
        p_garment_type_code: garmentTypeCode,
        p_stage: stage,
        p_amount: amount,
      });
      if (error) throw error;
      toast.success(t("toast_rate_saved") || "Rate saved");
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_save_rate") || "Could not save this rate"),
      );
    }
  }

  async function fixEarning(earningId: string, memberRef: string | null, rate: number | null) {
    try {
      const { error } = await supabase.rpc("fix_staff_earning", {
        p_earning_id: earningId,
        p_member_ref: memberRef ?? undefined,
        p_rate: rate ?? undefined,
      });
      if (error) throw error;
      toast.success(t("toast_earning_fixed") || "Earning fixed");
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_fix_earning") || "Could not fix this earning"),
      );
    }
  }

  async function voidEarning(earningId: string, reason: string) {
    try {
      const { error } = await supabase.rpc("void_staff_earning", {
        p_earning_id: earningId,
        p_reason: reason,
      });
      if (error) throw error;
      toast.success(t("toast_earning_voided") || "Earning voided");
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_void_earning") || "Could not void this earning"),
      );
    }
  }

  async function recordAdvance(memberRef: string, amount: number, note: string) {
    if (!storeId) return;
    try {
      const { error } = await supabase.rpc("record_staff_advance", {
        p_store_id: storeId,
        p_member_ref: memberRef,
        p_amount: amount,
        p_note: note || undefined,
      });
      if (error) throw error;
      toast.success(t("toast_advance_recorded") || "Advance recorded");
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t("toast_could_not_record_advance") || "Could not record this advance",
        ),
      );
    }
  }

  const [generating, setGenerating] = useState(false);
  async function generateRun() {
    if (!storeId) return;
    setGenerating(true);
    try {
      const { error } = await supabase.rpc("generate_payroll_run", {
        p_store_id: storeId,
        p_period_start: period.start,
        p_period_end: period.end,
      });
      if (error) throw error;
      toast.success(
        run
          ? t("toast_draft_regenerated") || "Draft regenerated"
          : t("toast_draft_generated") || "Draft run generated",
      );
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_generate_run") || "Could not generate this run"),
      );
    } finally {
      setGenerating(false);
    }
  }

  const [markingPaid, setMarkingPaid] = useState(false);
  async function markPaid() {
    if (!run) return;
    setMarkingPaid(true);
    try {
      const { error } = await supabase.rpc("mark_payroll_run_paid", { p_run_id: run.id });
      if (error) throw error;
      toast.success(t("toast_marked_paid") || "Payroll marked as paid");
      invalidatePayroll();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toast_could_not_mark_paid") || "Could not mark this run as paid"),
      );
    } finally {
      setMarkingPaid(false);
    }
  }

  function downloadCsv() {
    if (!lines || lines.length === 0) return;
    const csv = buildPayrollCsv(period, lines, nameByMember);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${period.start}-to-${period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canManage) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title={t("not_available_title") || "Not available"}
            description={
              t("not_available_description") ||
              "Staff payroll is managed by the owner and managers of your store."
            }
          />
        </div>
      </AppShell>
    );
  }

  if (featureLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!feature?.allowed) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title={t("upgrade_title") || "Upgrade to unlock staff payroll"}
            description={
              t("upgrade_description") ||
              "Pay tailors per garment or per stage, track advances, and run weekly payroll. Available on the Business plan and above."
            }
            action={
              <div className="flex flex-col items-center gap-2">
                <TierBadge tier={planCodeToTier(feature?.required_plan ?? "business")} />
                <Button
                  onClick={() =>
                    toast(t("billing_coming_soon") || "Billing isn't set up yet — coming soon")
                  }
                >
                  {t("upgrade_to_business") || "Upgrade to Business"}
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
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">{t("page_title") || "Staff payroll"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle") ||
            "Piece-rate pay per garment or stage, tracked automatically as orders move."}
        </p>
        <StitchDivider className="my-6" />

        {!online && (
          <div className="mb-4">
            <OfflineNotice
              label={t("offline_notice") || "Payroll needs a connection to load and save."}
            />
          </div>
        )}

        <Tabs defaultValue="run">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="run">{t("tab_run") || "Run"}</TabsTrigger>
            <TabsTrigger value="attention">
              {t("tab_needs_attention") || "Needs attention"}
              {needsAttention && needsAttention.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {needsAttention.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="advances">{t("tab_advances") || "Advances"}</TabsTrigger>
            <TabsTrigger value="rates">{t("tab_rates") || "Rates"}</TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPeriod((p) => shiftPayrollWeek(p, -1))}
                aria-label={t("previous_week_aria") || "Previous week"}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="font-medium">{formatPeriodLabel(period)}</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPeriod((p) => shiftPayrollWeek(p, 1))}
                aria-label={t("next_week_aria") || "Next week"}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {warnings && warnings.length > 0 && (
              <div className="rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm text-owed">
                {warnings.length}{" "}
                {t("needs_attention_warning") ||
                  'earning(s) need a rate or an assignee before it will count toward this run. See "Needs attention".'}
              </div>
            )}

            {run?.status === "paid" ? (
              <Badge className="bg-paid/15 text-paid">{t("run_paid_badge") || "Paid"}</Badge>
            ) : (
              <Button onClick={generateRun} disabled={generating || !online}>
                {generating
                  ? t("generating") || "Generating..."
                  : run
                    ? t("regenerate_draft") || "Regenerate draft"
                    : t("generate_draft") || "Generate draft run"}
              </Button>
            )}

            {lines && lines.length > 0 ? (
              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{nameByMember(line.member_ref)}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.jobs_count} {t("summary_jobs") || "job(s)"} ·{" "}
                        {t("summary_gross") || "gross"} <MoneyText amount={line.gross} /> ·{" "}
                        {t("summary_advances") || "advances"} <MoneyText amount={line.advances} />
                        {line.carried_forward > 0 && (
                          <>
                            {" "}
                            · {t("summary_carried_forward") || "carried forward"}{" "}
                            <MoneyText amount={line.carried_forward} />
                          </>
                        )}
                      </p>
                    </div>
                    <p className="figures font-medium">
                      <MoneyText amount={line.net} />
                    </p>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadCsv}>
                    <Download className="size-4" />
                    {t("export_csv") || "Export CSV"}
                  </Button>
                  {isOwner && run?.status === "draft" && (
                    <Button size="sm" onClick={markPaid} disabled={markingPaid || !online}>
                      {markingPaid
                        ? t("marking_paid") || "Marking paid..."
                        : t("mark_as_paid") || "Mark as paid"}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                title={t("empty_run_title") || "No run for this period yet"}
                description={
                  t("empty_run_description") || "Generate a draft to see who earned what this week."
                }
              />
            )}
          </TabsContent>

          <TabsContent value="attention" className="mt-6">
            {!needsAttention || needsAttention.length === 0 ? (
              <EmptyState
                title={t("empty_attention_title") || "Nothing needs attention"}
                description={
                  t("empty_attention_description") || "Every earning has a rate and an assignee."
                }
              />
            ) : (
              <div className="space-y-3">
                {needsAttention.map((earning) => (
                  <NeedsAttentionRow
                    key={earning.id}
                    earning={earning}
                    members={members ?? []}
                    nameByMember={nameByMember}
                    onFix={fixEarning}
                    onVoid={voidEarning}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="advances" className="mt-6">
            <AdvancesPanel
              members={members ?? []}
              nameByMember={nameByMember}
              advances={advances ?? []}
              onRecord={recordAdvance}
            />
          </TabsContent>

          <TabsContent value="rates" className="mt-6">
            {!isOwner ? (
              <EmptyState
                title={t("owner_only_title") || "Owner only"}
                description={
                  t("owner_only_description") || "Only the store owner can edit pay rates."
                }
              />
            ) : (
              <RatesEditor rateFor={rateFor} onSave={saveRate} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function RatesEditor({
  rateFor,
  onSave,
}: {
  rateFor: (garmentTypeCode: string, stage: string) => { amount: number } | undefined;
  onSave: (garmentTypeCode: string, stage: string, amount: number) => Promise<void>;
}) {
  const t = useAppT("app_payroll");
  const [garmentType, setGarmentType] = useState<string>(GARMENT_TYPES[0]);
  const garmentTypeCode = GARMENT_TYPE_CODE_BY_NAME[garmentType] ?? "";
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function valueFor(stage: string) {
    if (inputs[stage] !== undefined) return inputs[stage];
    const existing = rateFor(garmentTypeCode, stage);
    return existing ? String(existing.amount) : "";
  }

  async function save(stage: string) {
    const amount = Number(valueFor(stage)) || 0;
    setSaving(stage);
    await onSave(garmentTypeCode, stage, amount);
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("garment_type_label") || "Garment type"}</Label>
        <Select value={garmentType} onValueChange={setGarmentType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GARMENT_TYPES.map((gt) => (
              <SelectItem key={gt} value={gt}>
                {gt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
        {t("whole_garment_note") ||
          'Set a "Whole garment" rate to pay once at Ready instead of per stage — when it\'s set, every per-stage rate below is ignored for this garment type.'}
      </div>

      <div className="space-y-3">
        {(["whole", ...PAYROLL_STAGES] as const).map((stage) => (
          <div key={stage} className="flex items-center gap-2">
            <Label className="w-32 shrink-0">{STAGE_LABELS[stage]}</Label>
            <MoneyInput
              value={valueFor(stage)}
              onChange={(v) => setInputs((prev) => ({ ...prev, [stage]: v }))}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void save(stage)}
              disabled={saving === stage}
            >
              {saving === stage ? t("action_saving") || "Saving..." : t("action_save") || "Save"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NeedsAttentionRow({
  earning,
  members,
  nameByMember,
  onFix,
  onVoid,
}: {
  earning: { id: string; stage: string; status: string; member_ref: string | null; rate: number };
  members: { user_id: string }[];
  nameByMember: (memberRef: string | null) => string;
  onFix: (id: string, memberRef: string | null, rate: number | null) => Promise<void>;
  onVoid: (id: string, reason: string) => Promise<void>;
}) {
  const t = useAppT("app_payroll");
  const [memberRef, setMemberRef] = useState(earning.member_ref ?? "");
  const [rate, setRate] = useState(earning.rate ? String(earning.rate) : "");
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <p className="font-medium">
          {STAGE_LABELS[earning.stage as keyof typeof STAGE_LABELS] ?? earning.stage}
        </p>
        <Badge variant="secondary">
          {earning.status === "needs_rate"
            ? t("needs_rate_badge") || "Needs rate"
            : t("unassigned_badge") || "Unassigned"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {earning.status === "unassigned" && (
          <div className="space-y-1">
            <Label className="text-xs">{t("assign_to_label") || "Assign to"}</Label>
            <Select value={memberRef} onValueChange={setMemberRef}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("choose_placeholder") || "Choose"} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {nameByMember(m.user_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {earning.status === "needs_rate" && (
          <div className="space-y-1">
            <Label className="text-xs">{t("rate_label") || "Rate"}</Label>
            <MoneyInput value={rate} onChange={setRate} />
          </div>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onFix(earning.id, memberRef || null, rate ? Number(rate) : null);
            setBusy(false);
          }}
        >
          {t("fix_button") || "Fix"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVoidOpen(true)}>
          {t("void_button") || "Void"}
        </Button>
      </div>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("void_earning_title") || "Void this earning"}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={t("reason_placeholder") || "Reason"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await onVoid(earning.id, reason.trim());
                setBusy(false);
                setVoidOpen(false);
              }}
            >
              {t("void_confirm") || "Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdvancesPanel({
  members,
  nameByMember,
  advances,
  onRecord,
}: {
  members: { user_id: string }[];
  nameByMember: (memberRef: string | null) => string;
  advances: {
    id: string;
    member_ref: string;
    amount: number;
    note: string | null;
    given_at: string;
  }[];
  onRecord: (memberRef: string, amount: number, note: string) => Promise<void>;
}) {
  const t = useAppT("app_payroll");
  const [memberRef, setMemberRef] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-sm font-medium">{t("record_advance_title") || "Record an advance"}</p>
        <div className="space-y-2">
          <Label className="text-xs">{t("staff_member_label") || "Staff member"}</Label>
          <Select value={memberRef} onValueChange={setMemberRef}>
            <SelectTrigger>
              <SelectValue placeholder={t("choose_placeholder") || "Choose"} />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {nameByMember(m.user_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">{t("amount_label") || "Amount"}</Label>
          <MoneyInput value={amount} onChange={setAmount} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">{t("note_optional_label") || "Note (optional)"}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button
          disabled={!memberRef || !Number(amount) || saving}
          onClick={async () => {
            setSaving(true);
            await onRecord(memberRef, Number(amount), note);
            setAmount("");
            setNote("");
            setSaving(false);
          }}
        >
          {saving
            ? t("recording") || "Recording..."
            : t("record_advance_button") || "Record advance"}
        </Button>
      </div>

      {advances.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("no_advances") || "No undeducted advances."}
        </p>
      ) : (
        <div className="space-y-2">
          {advances.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{nameByMember(a.member_ref)}</p>
                {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
              </div>
              <p className="figures">
                <MoneyText amount={a.amount} />
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
