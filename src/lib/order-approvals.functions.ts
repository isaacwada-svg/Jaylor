import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const STYLE_PHOTOS_BUCKET = "order-style-photos";
const MATERIAL_PHOTOS_BUCKET = "order-materials";

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

export type OrderApprovalMaterial = {
  description: string | null;
  colour: string | null;
  yards: number | null;
  cost: number;
  cost_per_yard: number | null;
  source: string;
  photo_url: string | null;
  photo_urls: string[];
  extras_received: string | null;
};

export type OrderApprovalSnapshot = {
  garment_type: string;
  quantity: number;
  materials: OrderApprovalMaterial[];
  style_reference_photos: string[];
  style_notes: string | null;
  measurements: {
    values: Record<string, number>;
    extra_fields: Record<string, number | string>;
    unit: string;
    taken_at: string;
  } | null;
  price: number;
  amount_paid: number;
  delivery_date: string | null;
};

export type OrderApprovalView = {
  storeName: string;
  storeLogoUrl: string | null;
  storeLanguage: string | null;
  clientPreferredLanguage: string | null;
  status: "pending" | "approved" | "changes_requested";
  snapshot: OrderApprovalSnapshot;
  clientComment: string | null;
  respondedAt: string | null;
  createdAt: string;
};

/** Public approval view for /a/$token -- reads only through the
 *  get_order_approval() SECURITY DEFINER function, never a table directly.
 *  Photo paths (private order-style-photos bucket) are signed here,
 *  server-side, before being handed to the client. */
export const getOrderApproval = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<OrderApprovalView | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("order_approval_view", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const { data: view, error } = await supabaseAdmin.rpc("get_order_approval", {
      p_token: data.token,
    });
    if (error) throw new Error("Could not load this request");
    if (!view) return null;

    const raw = view as {
      store_name: string;
      store_logo_url: string | null;
      store_language: string | null;
      client_preferred_language: string | null;
      status: "pending" | "approved" | "changes_requested";
      snapshot: OrderApprovalSnapshot;
      client_comment: string | null;
      responded_at: string | null;
      created_at: string;
    };

    // Older snapshots (before PR E) only carry a single photo_url per
    // material -- fall back to that so old approvals still render.
    const materialPhotoPaths = (m: OrderApprovalMaterial): string[] =>
      m.photo_urls && m.photo_urls.length > 0 ? m.photo_urls : m.photo_url ? [m.photo_url] : [];

    const stylePaths = raw.snapshot.style_reference_photos;
    const materialPaths = raw.snapshot.materials.flatMap(materialPhotoPaths);

    let signedStyleByPath = new Map<string, string>();
    let signedMaterialByPath = new Map<string, string>();
    if (stylePaths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from(STYLE_PHOTOS_BUCKET)
        .createSignedUrls(stylePaths, SIGNED_URL_TTL);
      signedStyleByPath = new Map(
        (signed ?? [])
          .filter((s) => !!s.signedUrl && !!s.path)
          .map((s) => [s.path as string, s.signedUrl as string]),
      );
    }
    if (materialPaths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from(MATERIAL_PHOTOS_BUCKET)
        .createSignedUrls(materialPaths, SIGNED_URL_TTL);
      signedMaterialByPath = new Map(
        (signed ?? [])
          .filter((s) => !!s.signedUrl && !!s.path)
          .map((s) => [s.path as string, s.signedUrl as string]),
      );
    }

    return {
      storeName: raw.store_name,
      storeLogoUrl: raw.store_logo_url,
      storeLanguage: raw.store_language,
      clientPreferredLanguage: raw.client_preferred_language,
      status: raw.status,
      snapshot: {
        ...raw.snapshot,
        style_reference_photos: stylePaths.map((p) => signedStyleByPath.get(p) ?? p),
        materials: raw.snapshot.materials.map((m) => {
          const paths = materialPhotoPaths(m);
          const signedUrls = paths.map((p) => signedMaterialByPath.get(p) ?? p);
          return {
            ...m,
            photo_url: signedUrls[0] ?? null,
            photo_urls: signedUrls,
          };
        }),
      },
      clientComment: raw.client_comment,
      respondedAt: raw.responded_at,
      createdAt: raw.created_at,
    };
  });

const respondSchema = z.object({
  token: z.string().min(10).max(200),
  status: z.enum(["approved", "changes_requested"]),
  comment: z.string().max(1000).optional(),
});

/** The client tapping Approve or Request changes. */
export const respondToOrderApproval = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => respondSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!(await withinRateLimit("order_approval_respond", data.token))) {
      return { ok: false };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("respond_to_order_approval", {
      p_token: data.token,
      p_status: data.status,
      p_comment: data.comment?.trim() || undefined,
    });
    return { ok: !error };
  });
