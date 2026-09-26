import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Same shape/limits as the contract "guest accept" flow in jobs.functions.ts. */
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

export type QuotePreview = {
  quoteNumber: string | null;
  garmentType: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  notes: string | null;
  validUntil: string;
  status: string;
  expired: boolean;
  clientName: string;
  storeName: string;
  storeAddress: string | null;
  storeLogoUrl: string | null;
};

/** Public quote preview for the client-facing /q/$token page -- service-role, since a
 *  prospective customer has no Jaylor account or session. */
export const getQuotePreview = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<QuotePreview | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select(
        "quote_number, garment_type, quantity, unit_price, discount_percent, notes, valid_until, status, client_id, store_id",
      )
      .eq("quote_token", data.token)
      .maybeSingle();
    if (!quote) return null;

    const [{ data: client }, { data: store }] = await Promise.all([
      supabaseAdmin.from("clients").select("full_name").eq("id", quote.client_id).maybeSingle(),
      supabaseAdmin
        .from("stores")
        .select("name, address, logo_url")
        .eq("id", quote.store_id)
        .maybeSingle(),
    ]);

    return {
      quoteNumber: quote.quote_number,
      garmentType: quote.garment_type,
      quantity: quote.quantity,
      unitPrice: quote.unit_price,
      discountPercent: quote.discount_percent,
      notes: quote.notes,
      validUntil: quote.valid_until,
      status: quote.status,
      expired: new Date(quote.valid_until) < new Date(),
      clientName: client?.full_name ?? "",
      storeName: store?.name ?? "Jaylor",
      storeAddress: store?.address ?? null,
      storeLogoUrl: store?.logo_url ?? null,
    };
  });

/** The client tapping "Accept this quote" -- moves draft/sent -> accepted. Converting the
 *  accepted quote into an actual order still requires a signed-in owner/manager. */
export const acceptQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!(await withinRateLimit("quote_accept", data.token))) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("id, status, valid_until")
      .eq("quote_token", data.token)
      .maybeSingle();
    if (!quote) return { ok: false };
    if (new Date(quote.valid_until) < new Date()) return { ok: false };
    if (quote.status !== "draft" && quote.status !== "sent") return { ok: false };

    const { error } = await supabaseAdmin
      .from("quotes")
      .update({ status: "accepted" })
      .eq("id", quote.id);
    return { ok: !error };
  });
