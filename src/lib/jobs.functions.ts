import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nextInvoiceNumber } from "@/lib/quote";

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

export type JobQuoteView = {
  stage: string;
  storeName: string;
  storeLogoUrl: string | null;
  storeCity: string | null;
  storeWhatsapp: string | null;
  jobName: string;
  organiserName: string | null;
  organiserPhone: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  vatEnabled: boolean;
  vatPercent: number;
  validityDate: string | null;
  deliveryDate: string | null;
  depositPercent: number | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  paidAmount: number;
};

export const getJobQuote = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<JobQuoteView | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: participant, error } = await supabaseAdmin
      .from("event_participants")
      .select("event_id, paid_amount")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !participant) return null;

    const { data: event } = await supabaseAdmin
      .from("events")
      .select(
        "name, organiser_name, organiser_phone, fabric_description, quantity, price_per_person, vat_enabled, vat_percent, validity_date, delivery_date, deposit_percent, invoice_number, po_number, stage, store_id",
      )
      .eq("id", participant.event_id)
      .maybeSingle();
    if (!event) return null;

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name, logo_url, city, whatsapp_phone")
      .eq("id", event.store_id)
      .maybeSingle();

    return {
      stage: event.stage,
      storeName: store?.name ?? "",
      storeLogoUrl: store?.logo_url ?? null,
      storeCity: store?.city ?? null,
      storeWhatsapp: store?.whatsapp_phone ?? null,
      jobName: event.name,
      organiserName: event.organiser_name,
      organiserPhone: event.organiser_phone,
      description: event.fabric_description,
      quantity: event.quantity,
      unitPrice: event.price_per_person,
      vatEnabled: event.vat_enabled,
      vatPercent: event.vat_percent,
      validityDate: event.validity_date,
      deliveryDate: event.delivery_date,
      depositPercent: event.deposit_percent,
      invoiceNumber: event.invoice_number,
      poNumber: event.po_number,
      paidAmount: participant.paid_amount,
    };
  });

export const acceptJobQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("job_quote_accept", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { data: participant } = await supabaseAdmin
      .from("event_participants")
      .select("event_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!participant) throw new Error("This quote was not found");

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, stage")
      .eq("id", participant.event_id)
      .maybeSingle();
    if (!event) throw new Error("This quote was not found");
    if (event.stage !== "quote") return { ok: true };

    const invoiceNumber = nextInvoiceNumber(event.id);
    const { error } = await supabaseAdmin
      .from("events")
      .update({ stage: "live", invoice_number: invoiceNumber })
      .eq("id", event.id);
    if (error) throw new Error("Could not accept this quote");

    return { ok: true };
  });

export type MeasuringSessionOption = {
  id: string;
  sessionDate: string;
  sessionTime: string | null;
  venue: string | null;
  bookedCount: number;
};

export type MeasuringSessions = {
  sessions: MeasuringSessionOption[];
  chosenSessionId: string | null;
};

export const getMeasuringSessions = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<MeasuringSessions | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: participant, error } = await supabaseAdmin
      .from("event_participants")
      .select("event_id, measuring_session_id")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !participant) return null;

    const { data: sessions } = await supabaseAdmin
      .from("event_measuring_sessions")
      .select("id, session_date, session_time, venue")
      .eq("event_id", participant.event_id)
      .order("session_date", { ascending: true });
    if (!sessions || sessions.length === 0) {
      return { sessions: [], chosenSessionId: participant.measuring_session_id };
    }

    const { data: booked } = await supabaseAdmin
      .from("event_participants")
      .select("measuring_session_id")
      .eq("event_id", participant.event_id)
      .not("measuring_session_id", "is", null);
    const counts: Record<string, number> = {};
    for (const row of booked ?? []) {
      if (row.measuring_session_id) {
        counts[row.measuring_session_id] = (counts[row.measuring_session_id] ?? 0) + 1;
      }
    }

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        sessionDate: s.session_date,
        sessionTime: s.session_time,
        venue: s.venue,
        bookedCount: counts[s.id] ?? 0,
      })),
      chosenSessionId: participant.measuring_session_id,
    };
  });

const sessionSchema = z.object({
  token: z.string().min(10).max(200),
  sessionId: z.string().uuid(),
});

export const setMeasuringSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("job_measuring_session", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { error } = await supabaseAdmin
      .from("event_participants")
      .update({ measuring_session_id: data.sessionId })
      .eq("token", data.token);
    if (error) throw new Error("Could not save your slot");

    return { ok: true };
  });
