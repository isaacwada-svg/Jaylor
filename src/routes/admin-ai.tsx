import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/admin-ai")({
  head: () => ({
    meta: [
      { title: "AI costs · Jaylor admin" },
      { name: "description", content: "Platform AI spend, credit sales and settings." },
      { property: "og:title", content: "AI costs · Jaylor admin" },
      { property: "og:description", content: "Platform AI spend and credit settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAiPage,
});

type Overview = {
  today_usd: number; today_ngn: number; month_usd: number; month_ngn: number;
  credits_used_month: number; credits_sold_month: number; topup_revenue_month: number;
  stores: { id: string; name: string; plan_code: string; ai_cost_ngn: number; paid_ngn: number; ai_custom_allowance: number | null }[];
};

const n = (v: number, d = 0) => Number(v ?? 0).toLocaleString("en-NG", { maximumFractionDigits: d });

function AdminAiPage() {
  const qc = useQueryClient();
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["is-platform-admin"],
    queryFn: async () => (await supabase.rpc("is_platform_admin")).data === true,
  });
  const { data: ov } = useQuery({
    queryKey: ["admin-ai-overview"],
    enabled: isAdmin === true,
    queryFn: async () => (await db.rpc("admin_ai_cost_overview")).data as Overview,
  });
  const { data: tables } = useQuery({
    queryKey: ["admin-ai-tables"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const [c, f, p, a] = await Promise.all([
        db.from("ai_config").select("*").order("key"),
        db.from("ai_feature_costs").select("*").order("feature_key"),
        db.from("ai_credit_packs").select("*").order("sort_order"),
        db.from("ai_plan_allowances").select("*"),
      ]);
      return { config: c.data ?? [], features: f.data ?? [], packs: p.data ?? [], allowances: a.data ?? [] };
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-ai-tables"] });

  async function save(table: string, match: Record<string, unknown>, patch: Record<string, unknown>) {
    let q = db.from(table).update(patch);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      refresh();
    }
  }

  if (isLoading) return <p className="p-8">Loading…</p>;
  if (!isAdmin) return <p className="p-8">This page is only for the platform owner. <Link to="/" className="underline">Go home</Link></p>;

  const aiOn = tables?.config.find((r: { key: string }) => r.key === "ai_enabled")?.value !== false;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">AI costs</h1>
        <Link to="/admin" className="text-sm underline">Back to admin</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["AI spend today", `$${n(ov?.today_usd ?? 0, 2)} · ₦${n(ov?.today_ngn ?? 0)}`],
          ["AI spend this month", `$${n(ov?.month_usd ?? 0, 2)} · ₦${n(ov?.month_ngn ?? 0)}`],
          ["Credits used this month", n(ov?.credits_used_month ?? 0)],
          ["Credits sold this month", n(ov?.credits_sold_month ?? 0)],
          ["Top-up revenue this month", `₦${n(ov?.topup_revenue_month ?? 0)}`],
        ].map(([k, v]) => (
          <div key={k} className="border border-border p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 text-xl">{v}</p>
          </div>
        ))}
        <div className="flex items-center justify-between border border-border p-4">
          <span>All AI on</span>
          <Switch checked={aiOn} onCheckedChange={(v) => save("ai_config", { key: "ai_enabled" }, { value: v })} />
        </div>
      </section>

      <section>
        <h2 className="text-xl">Shops this month</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Shop</th><th>Plan</th><th>AI cost</th><th>Paid</th><th>Custom credits</th></tr></thead>
          <tbody>
            {(ov?.stores ?? []).map((s) => {
              const flag = s.ai_cost_ngn > 0 && s.ai_cost_ngn > s.paid_ngn * 0.25;
              return (
                <tr key={s.id} className={flag ? "text-destructive" : ""}>
                  <td className="py-1">{s.name}{flag ? " ⚠" : ""}</td>
                  <td>{s.plan_code}</td>
                  <td>₦{n(s.ai_cost_ngn)}</td>
                  <td>₦{n(s.paid_ngn)}</td>
                  <td>{s.plan_code === "custom" && <CustomAllowance storeId={s.id} value={s.ai_custom_allowance} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">⚠ = AI cost above 25% of what the shop paid this month.</p>
      </section>

      <section>
        <h2 className="text-xl">Feature costs</h2>
        <div className="mt-2 space-y-2">
          {(tables?.features ?? []).map((f: { feature_key: string; label: string; credits: number; enabled: boolean; min_plan: string }) => (
            <div key={f.feature_key} className="grid grid-cols-[1fr_90px_110px_60px] items-center gap-2">
              <span>{f.label}</span>
              <Input type="number" defaultValue={f.credits} onBlur={(e) => Number(e.target.value) !== f.credits && save("ai_feature_costs", { feature_key: f.feature_key }, { credits: Number(e.target.value) })} />
              <select defaultValue={f.min_plan} className="h-10 border border-input bg-background px-2" onChange={(e) => save("ai_feature_costs", { feature_key: f.feature_key }, { min_plan: e.target.value })}>
                {["free", "growth", "business", "custom"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <Switch checked={f.enabled} onCheckedChange={(v) => save("ai_feature_costs", { feature_key: f.feature_key }, { enabled: v })} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl">Top-up packs</h2>
        <div className="mt-2 space-y-2">
          {(tables?.packs ?? []).map((p: { id: string; name: string; credits: number; price_ngn: number; active: boolean }) => (
            <div key={p.id} className="grid grid-cols-[1fr_100px_120px_60px] items-center gap-2">
              <span>{p.name}</span>
              <Input type="number" defaultValue={p.credits} onBlur={(e) => Number(e.target.value) !== p.credits && save("ai_credit_packs", { id: p.id }, { credits: Number(e.target.value) })} />
              <Input type="number" defaultValue={p.price_ngn} onBlur={(e) => Number(e.target.value) !== p.price_ngn && save("ai_credit_packs", { id: p.id }, { price_ngn: Number(e.target.value) })} />
              <Switch checked={p.active} onCheckedChange={(v) => save("ai_credit_packs", { id: p.id }, { active: v })} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl">Plan credits</h2>
        <p className="text-xs text-muted-foreground">Monthly credits · Free lifetime trial · 14-day trial credits</p>
        <div className="mt-2 space-y-2">
          {(tables?.allowances ?? []).map((a: { plan_code: string; monthly_credits: number; lifetime_trial_credits: number; trial_period_credits: number }) => (
            <div key={a.plan_code} className="grid grid-cols-[1fr_100px_100px_100px] items-center gap-2">
              <span>{a.plan_code}</span>
              {(["monthly_credits", "lifetime_trial_credits", "trial_period_credits"] as const).map((k) => (
                <Input key={k} type="number" defaultValue={a[k]} onBlur={(e) => Number(e.target.value) !== a[k] && save("ai_plan_allowances", { plan_code: a.plan_code }, { [k]: Number(e.target.value) })} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl">Settings (FX rate, daily caps, model IDs, prices)</h2>
        <div className="mt-2 space-y-2">
          {(tables?.config ?? []).filter((r: { key: string }) => r.key !== "ai_enabled").map((r: { key: string; value: unknown }) => (
            <div key={r.key} className="grid grid-cols-[1fr_220px] items-center gap-2">
              <span className="text-sm">{r.key}</span>
              <Input
                defaultValue={typeof r.value === "string" ? r.value : JSON.stringify(r.value)}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const val = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
                  if (JSON.stringify(val) !== JSON.stringify(r.value)) save("ai_config", { key: r.key }, { value: val, updated_at: new Date().toISOString() });
                }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CustomAllowance({ storeId, value }: { storeId: string; value: number | null }) {
  const [v, setV] = useState(String(value ?? 0));
  return (
    <div className="flex gap-1">
      <Input className="h-8 w-20" type="number" value={v} onChange={(e) => setV(e.target.value)} />
      <Button size="sm" variant="outline" onClick={async () => {
        const { error } = await db.rpc("admin_set_store_ai_allowance", { p_store_id: storeId, p_credits: Number(v) });
        if (error) toast.error(error.message);
        else toast.success("Saved");
      }}>Save</Button>
    </div>
  );
}
