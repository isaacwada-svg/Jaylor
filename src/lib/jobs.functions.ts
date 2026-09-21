import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The guest page (e.$token.tsx) reads its core data through the existing
 * get_participant_by_token RPC, whose body predates this session and isn't
 * in a tracked migration. Rather than risk rewriting it blind, size/tier/
 * sponsorship data (added for the group-order engine's G2 step) is read and
 * written here instead, service-role, mirroring passport.functions.ts.
 */

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;

async function withinRateLimit(bucket: string, token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_key: token,
    p_max_count: RATE_LIMIT_MAX,
    p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
  });
  return data !== false;
}

const tokenSchema = z.object({ token: z.string().min(10).max(200) });

export type SizeOption = {
  key: string;
  label: string;
  chest: string;
  waist: string;
  length: string;
};

export type PriceTier = { minQty: number; maxQty: number | null; price: number };

export type JobExtras = {
  sizeChart: SizeOption[];
  sizeKey: string | null;
  priceTiers: PriceTier[];
  currentTierPrice: number | null;
  participantCount: number;
  payerMode: string;
  collectionMode: string;
  pricingMode: string;
  isSponsored: boolean;
};

export const getJobExtras = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<JobExtras | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: participant, error } = await supabaseAdmin
      .from("event_participants")
      .select("event_id, size_key, is_sponsored")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !participant) return null;

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("size_chart, price_tiers, payer_mode, collection_mode, pricing_mode")
      .eq("id", participant.event_id)
      .maybeSingle();
    if (!event) return null;

    const { count } = await supabaseAdmin
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", participant.event_id)
      .neq("status", "cancelled");

    const tiers = ((event.price_tiers as PriceTier[] | null) ?? []).sort(
      (a, b) => a.minQty - b.minQty,
    );
    const participantCount = count ?? 0;
    const currentTier = tiers.find(
      (t) => participantCount >= t.minQty && (t.maxQty == null || participantCount <= t.maxQty),
    );

    return {
      sizeChart: (event.size_chart as SizeOption[] | null) ?? [],
      sizeKey: participant.size_key,
      priceTiers: tiers,
      currentTierPrice: currentTier?.price ?? null,
      participantCount,
      payerMode: event.payer_mode,
      collectionMode: event.collection_mode,
      pricingMode: event.pricing_mode,
      isSponsored: participant.is_sponsored,
    };
  });

const sizeSchema = z.object({
  token: z.string().min(10).max(200),
  sizeKey: z.string().min(1).max(60),
});

export const setParticipantSize = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sizeSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("job_participant_size", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { error } = await supabaseAdmin
      .from("event_participants")
      .update({ size_key: data.sizeKey })
      .eq("token", data.token);
    if (error) throw new Error("Could not save your size");

    return { ok: true };
  });
