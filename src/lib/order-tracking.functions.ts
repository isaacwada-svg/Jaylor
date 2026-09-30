import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const BUCKET = "order-progress-photos";

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

export type OrderTrackingTimelineEntry = {
  from_status: string | null;
  to_status: string;
  changed_at: string;
  note: string | null;
  photo_url: string | null;
};

export type OrderTrackingView = {
  storeName: string;
  storeLogoUrl: string | null;
  garmentType: string;
  quantity: number;
  status: string;
  deliveryDate: string | null;
  readyAt: string | null;
  paid: number;
  balance: number;
  timeline: OrderTrackingTimelineEntry[];
  dedicatedAccount: { accountNumber: string; accountName: string; bankName: string } | null;
  jaylorPayAvailable: boolean;
  nextFitting: { startsAt: string; purpose: string } | null;
};

/** Public order-tracking view for /t/$token -- reads only through the
 *  get_order_tracking() SECURITY DEFINER function, never a table directly.
 *  Photo paths from the private order-progress-photos bucket are signed
 *  here, server-side, before being handed to the client. */
export const getOrderTracking = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<OrderTrackingView | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("order_tracking_view", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { data: view, error } = await supabaseAdmin.rpc("get_order_tracking", {
      p_token: data.token,
    });
    if (error) throw new Error("Could not load this order");
    if (!view) return null;

    const raw = view as {
      store_name: string;
      store_logo_url: string | null;
      garment_type: string;
      quantity: number;
      status: string;
      delivery_date: string | null;
      ready_at: string | null;
      paid: number;
      balance: number;
      timeline: OrderTrackingTimelineEntry[];
      dedicated_account: { account_number: string; account_name: string; bank_name: string } | null;
      jaylor_pay_available: boolean;
      next_fitting: { starts_at: string; purpose: string } | null;
    };

    const photoPaths = raw.timeline.map((t) => t.photo_url).filter((p): p is string => !!p);

    let signedByPath = new Map<string, string>();
    if (photoPaths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrls(photoPaths, SIGNED_URL_TTL);
      signedByPath = new Map(
        (signed ?? [])
          .filter((s) => !!s.signedUrl && !!s.path)
          .map((s) => [s.path as string, s.signedUrl as string]),
      );
    }

    return {
      storeName: raw.store_name,
      storeLogoUrl: raw.store_logo_url,
      garmentType: raw.garment_type,
      quantity: raw.quantity,
      status: raw.status,
      deliveryDate: raw.delivery_date,
      readyAt: raw.ready_at,
      paid: raw.paid,
      balance: raw.balance,
      timeline: raw.timeline.map((t) => ({
        ...t,
        photo_url: t.photo_url ? (signedByPath.get(t.photo_url) ?? null) : null,
      })),
      dedicatedAccount: raw.dedicated_account
        ? {
            accountNumber: raw.dedicated_account.account_number,
            accountName: raw.dedicated_account.account_name,
            bankName: raw.dedicated_account.bank_name,
          }
        : null,
      jaylorPayAvailable: raw.jaylor_pay_available,
      nextFitting: raw.next_fitting
        ? { startsAt: raw.next_fitting.starts_at, purpose: raw.next_fitting.purpose }
        : null,
    };
  });
