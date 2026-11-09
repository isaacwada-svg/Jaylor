import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/lib/use-online-status";

/** Shape returned by get_home_dashboard() (PR U migration). Every money key
 *  is null for a tailor; plan-gated sections are null when the plan doesn't
 *  include them (see `access`). */
export type HomeDashboard = {
  generated_at: string;
  today: string;
  timezone: string;
  can_see_money: boolean;
  access: { profit: boolean; fittings: boolean; inventory: boolean };
  work: {
    due_soon_count: number;
    due_soon: DueSoonItem[];
    week_garments: number;
    today_garments: number;
    overdue_garments: number;
    active_orders: number;
  };
  fittings: { count: number; items: FittingItem[] } | null;
  low_stock: { count: number; items: LowStockItem[] } | null;
  my_jobs: MyJob[] | null;
  money: HomeMoney | null;
};

export type DueSoonItem = {
  order_id: string;
  number: string;
  garment_type: string;
  quantity: number;
  client_name: string | null;
  delivery_date: string;
  days_left: number;
  status: string;
  balance: number | null;
};

export type FittingItem = {
  id: string;
  starts_at: string;
  purpose: string;
  type: string;
  client_name: string | null;
  garment_type: string | null;
  order_id: string | null;
};

export type LowStockItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  reorder_level: number;
};

export type MyJob = {
  order_id: string;
  number: string;
  garment_type: string;
  quantity: number;
  delivery_date: string | null;
  status: string;
};

export type MethodTotals = Record<string, number>;

export type HomeMoney = {
  today: {
    total: number;
    count: number;
    prev_total: number;
    hourly: number[];
    methods: MethodTotals;
  };
  days: { date: string; amount: number }[];
  d7: { total: number; prev_total: number; methods: MethodTotals };
  d30: { total: number; prev_total: number; methods: MethodTotals };
  owed: { total: number; clients: number; overdue_clients: number };
  who_owes: WhoOwes[];
  recent_payments: RecentPayment[];
  margin: {
    collected: number;
    expenses: number;
    profit: number;
    pct: number | null;
    prev_pct: number | null;
  } | null;
};

export type WhoOwes = {
  client_id: string;
  client_name: string;
  phone: string;
  whatsapp_phone: string | null;
  consent_whatsapp: boolean;
  preferred_language: string | null;
  balance: number;
  earliest_due: string | null;
  overdue: boolean;
  order_id: string | null;
  garment_type: string | null;
  tracking_token: string | null;
};

export type RecentPayment = {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  method: string;
  voided: boolean;
  reference: string | null;
  order_id: string | null;
  order_number: string | null;
  garment_type: string | null;
  quantity: number | null;
  client_name: string | null;
  order_balance: number | null;
};

const CACHE_PREFIX = "jaylor:home-dashboard:";

function readCache(storeId: string): HomeDashboard | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + storeId);
    return raw ? (JSON.parse(raw) as HomeDashboard) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(storeId: string, data: HomeDashboard) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + storeId, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the live figures still show, just not offline.
  }
}

export const homeDashboardKey = (storeId: string | undefined) => ["home-dashboard", storeId];

/** One request for the whole Home screen and the shell's nav badges. The last
 *  good payload is kept per store so an offline phone still shows figures. */
export function useHomeDashboard(storeId: string | undefined) {
  const online = useOnlineStatus();
  const query = useQuery({
    queryKey: homeDashboardKey(storeId),
    enabled: !!storeId && online,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    initialData: () => (storeId ? readCache(storeId) : undefined),
    // Cached figures count as stale immediately, so a fresh load follows.
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_home_dashboard" as never,
        { p_store_id: storeId } as never,
      );
      if (error) throw error;
      return data as unknown as HomeDashboard;
    },
  });

  useEffect(() => {
    if (storeId && query.data && query.isFetchedAfterMount) writeCache(storeId, query.data);
  }, [storeId, query.data, query.isFetchedAfterMount]);

  const showingCached = !!query.data && (!online || (!query.isFetchedAfterMount && query.isError));
  return { ...query, online, showingCached };
}
