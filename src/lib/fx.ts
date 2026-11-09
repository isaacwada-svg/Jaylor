import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// get_public_fx_rate() is a new RPC the generated Database types don't know
// about yet -- same drift as every other freshly-migrated object in this
// project; narrowly cast at this one call site rather than losing typing
// across the file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Shown only as a rough guide for clients paying from abroad -- Paystack's
 * own card conversion at checkout is the real, final rate. The live value
 * is the same fx_rate_ngn_per_usd an admin edits at /admin-ai (the one
 * number this whole app's AI and cross-border-payment estimates now read
 * from); this constant is only the fallback shown before that loads, or if
 * it can't be reached, so these public pages never break.
 */
const FALLBACK_USD_NGN_RATE = 1600;

/** Public, unauthenticated-page-safe: get_public_fx_rate() is anon-granted. */
export function useFxRate() {
  return useQuery({
    queryKey: ["public-fx-rate"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_public_fx_rate");
      if (error) throw error;
      return Number(data) || FALLBACK_USD_NGN_RATE;
    },
  });
}

export function approximateUsd(ngn: number, rate: number = FALLBACK_USD_NGN_RATE): string {
  const usd = ngn / rate;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
