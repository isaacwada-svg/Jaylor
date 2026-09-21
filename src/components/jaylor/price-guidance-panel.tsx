import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/jaylor";

type OwnStats = {
  count: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgMargin: number | null;
};

type CityBenchmark = {
  contributing: boolean;
  has_enough_data?: boolean;
  city?: string;
  store_count?: number;
  order_count?: number;
  p25?: number;
  median?: number;
  p75?: number;
};

async function fetchOwnStats(storeId: string, garmentTypeCode: string): Promise<OwnStats | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, price")
    .eq("store_id", storeId)
    .eq("garment_type_code", garmentTypeCode)
    .gte("created_at", ninetyDaysAgo)
    .gt("price", 0);
  if (error) throw error;
  if (!orders || orders.length === 0) return null;

  const prices = orders.map((o) => o.price);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  const orderIds = orders.map((o) => o.id);
  const { data: materials } = await supabase
    .from("order_materials")
    .select("order_id, cost")
    .in("order_id", orderIds)
    .gt("cost", 0);
  const costByOrder = new Map<string, number>();
  for (const m of materials ?? []) {
    costByOrder.set(m.order_id, (costByOrder.get(m.order_id) ?? 0) + (m.cost ?? 0));
  }
  const margins = orders
    .filter((o) => costByOrder.has(o.id))
    .map((o) => o.price - (costByOrder.get(o.id) ?? 0));

  return {
    count: prices.length,
    avgPrice,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgMargin: margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
  };
}

/**
 * Price guidance, rule-based (no AI): this store's own 90-day price stats
 * are always shown; the city benchmark (opt-in, aggregate-only) shows once
 * enough contributing shops exist for that city + garment type.
 */
export function PriceGuidancePanel({
  storeId,
  garmentTypeCode,
  currentPrice,
}: {
  storeId: string;
  garmentTypeCode: string | null;
  currentPrice: number | null;
}) {
  const { data: ownStats, isLoading: ownLoading } = useQuery({
    queryKey: ["own-price-stats", storeId, garmentTypeCode],
    enabled: !!garmentTypeCode,
    queryFn: () => fetchOwnStats(storeId, garmentTypeCode as string),
  });

  const { data: benchmark, isLoading: benchmarkLoading } = useQuery({
    queryKey: ["city-price-benchmark", storeId, garmentTypeCode],
    enabled: !!garmentTypeCode,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("city_price_benchmark", {
        p_store_id: storeId,
        p_garment_type_code: garmentTypeCode as string,
      });
      if (error) throw error;
      return data as unknown as CityBenchmark;
    },
  });

  if (!garmentTypeCode || ownLoading || benchmarkLoading) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">Price guidance</p>
      {ownStats ? (
        <p className="text-muted-foreground">
          Your last 90 days: {formatMoney(ownStats.avgPrice)} average (range{" "}
          {formatMoney(ownStats.minPrice)}–{formatMoney(ownStats.maxPrice)}) across {ownStats.count}{" "}
          order{ownStats.count === 1 ? "" : "s"}.
          {ownStats.avgMargin != null && ` Average margin: ${formatMoney(ownStats.avgMargin)}.`}
        </p>
      ) : (
        <p className="text-muted-foreground">
          No pricing history yet for this garment type in the last 90 days.
        </p>
      )}

      {benchmark && !benchmark.contributing && (
        <p className="text-xs text-muted-foreground">
          Share anonymous prices to see what shops in your city charge.{" "}
          <Link to="/billing" className="underline underline-offset-2">
            Turn on sharing
          </Link>
          .
        </p>
      )}
      {benchmark && benchmark.contributing && !benchmark.has_enough_data && (
        <p className="text-xs text-muted-foreground">
          Not enough shops sharing data for this garment type in your city yet.
        </p>
      )}
      {benchmark && benchmark.contributing && benchmark.has_enough_data && (
        <div className="text-xs text-muted-foreground">
          <p>
            In {benchmark.city}, most shops charge {formatMoney(benchmark.p25 ?? 0)}–
            {formatMoney(benchmark.p75 ?? 0)} for this garment ({benchmark.store_count} shops,{" "}
            {benchmark.order_count} orders).
          </p>
          {currentPrice != null &&
            currentPrice > 0 &&
            benchmark.p25 != null &&
            currentPrice < benchmark.p25 && (
              <p className="mt-1 text-owed">You may be undercharging.</p>
            )}
        </div>
      )}
    </div>
  );
}
