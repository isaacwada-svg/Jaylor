import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export type FittingLinkStatus =
  "not_found" | "order_closed" | "expired" | "used" | "booked_reschedulable" | "available";

export type FittingLinkView = {
  status: FittingLinkStatus;
  storeName: string | null;
  storeWhatsapp: string | null;
  garmentType: string | null;
  quantity: number | null;
  purpose: string | null;
  startsAt: string | null;
  availableSlots: string[];
};

/** Public fitting-booking view for /f/$token -- reads only through the
 *  get_fitting_link_details() SECURITY DEFINER function, never a table
 *  directly. Every status (expired/used/order_closed/etc.) is a normal,
 *  non-error result -- the client renders its own friendly message. */
export const getFittingLinkDetails = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<FittingLinkView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("fitting_link_view", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { data: view, error } = await supabaseAdmin.rpc("get_fitting_link_details", {
      p_token: data.token,
    });
    if (error) throw new Error("Could not load this booking link");

    const raw = (view ?? { status: "not_found" }) as {
      status: FittingLinkStatus;
      store_name?: string;
      store_whatsapp?: string | null;
      garment_type?: string;
      quantity?: number;
      purpose?: string;
      starts_at?: string;
      available_slots?: string[];
    };

    return {
      status: raw.status,
      storeName: raw.store_name ?? null,
      storeWhatsapp: raw.store_whatsapp ?? null,
      garmentType: raw.garment_type ?? null,
      quantity: raw.quantity ?? null,
      purpose: raw.purpose ?? null,
      startsAt: raw.starts_at ?? null,
      availableSlots: raw.available_slots ?? [],
    };
  });

const bookSchema = z.object({
  token: z.string().min(10).max(200),
  startsAt: z.string().min(1),
});

/** The client picking a slot on the booking page. */
export const bookFittingViaLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => bookSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!(await withinRateLimit("fitting_link_book", data.token))) {
      return { ok: false, error: "Too many requests. Please try again later." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("book_fitting_via_link", {
      p_token: data.token,
      p_starts_at: data.startsAt,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

const rescheduleSchema = z.object({
  token: z.string().min(10).max(200),
  newStartsAt: z.string().min(1),
});

/** The client rescheduling their one time, from the same link. */
export const rescheduleFittingViaLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => rescheduleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!(await withinRateLimit("fitting_link_reschedule", data.token))) {
      return { ok: false, error: "Too many requests. Please try again later." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reschedule_fitting_via_link", {
      p_token: data.token,
      p_new_starts_at: data.newStartsAt,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
