import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function dayBounds() {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  const week = new Date(s);
  week.setDate(week.getDate() + 7);
  return { s, e, week };
}

export function DashboardOverview({ storeId }: { storeId?: string }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim().replace(/[%,()*\\]/g, "").slice(0, 60));

  const { data: counts } = useQuery({
    queryKey: ["dashboard-overview", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { s, e, week } = dayBounds();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const [active, pending, fittings] = await Promise.all([
        supabase
          .from("orders_for_tailor")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId as string)
          .not("status", "in", "(collected,cancelled)"),
        supabase
          .from("orders_for_tailor")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId as string)
          .not("status", "in", "(collected,cancelled)")
          .lte("delivery_date", iso(week)),
        supabase
          .from("consultations")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId as string)
          .eq("type", "fitting")
          .neq("status", "cancelled")
          .gte("starts_at", s.toISOString())
          .lt("starts_at", e.toISOString()),
      ]);
      return {
        active: active.count ?? 0,
        pending: pending.count ?? 0,
        fittings: fittings.error ? 0 : (fittings.count ?? 0),
      };
    },
  });

  const { data: results } = useQuery({
    queryKey: ["dashboard-search", storeId, term],
    enabled: !!storeId && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone")
        .eq("store_id", storeId as string)
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const tiles = [
    { label: "Active orders", value: counts?.active, to: "/orders" as const },
    { label: "Due within 7 days", value: counts?.pending, to: "/orders" as const },
    { label: "Fittings today", value: counts?.fittings, to: "/consultations" as const },
  ];

  return (
    <section className="mb-6 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="Find a client or measurement by name or phone"
          aria-label="Search clients"
          maxLength={60}
          className="h-12 pl-9 text-base"
        />
        {term.length >= 2 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border bg-popover shadow-lg">
            {results && results.length > 0 ? (
              results.map((c) => (
                <Link
                  key={c.id}
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{c.full_name}</span>
                  <span className="text-muted-foreground">{c.phone}</span>
                </Link>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">No matching clients</p>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            className="rounded-xl border bg-card p-3 transition-colors hover:border-gold/50 sm:p-4"
          >
            <p className="text-2xl font-semibold tabular-nums sm:text-3xl">{t.value ?? "–"}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:text-xs">
              {t.label}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
