import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "ai-design-photos";
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const UPLOAD_RATE_LIMIT_MAX = 20;
const UPLOAD_RATE_LIMIT_WINDOW_MINUTES = 60;

/** Accepts either a bare storage path or a legacy full public URL. */
function toStoragePath(value: string): string {
  const marker = `/${BUCKET}/`;
  const at = value.indexOf(marker);
  return at === -1 ? value.replace(/^\/+/, "") : value.slice(at + marker.length);
}

/**
 * Both photo uploads here write a real storage object with no other cap on
 * the caller — check_rate_limit is the same primitive generate-design
 * already uses for exactly this kind of unauthenticated write. Keyed on
 * storeId since neither upload has anything more specific (a phone number)
 * to identify the caller by at this point in the flow.
 */
type SupabaseAdmin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;
async function withinUploadRateLimit(supabaseAdmin: SupabaseAdmin, storeId: string) {
  const { data } = await supabaseAdmin.rpc("check_rate_limit", {
    p_bucket: "design_photo_upload",
    p_key: storeId,
    p_max_count: UPLOAD_RATE_LIMIT_MAX,
    p_window_minutes: UPLOAD_RATE_LIMIT_WINDOW_MINUTES,
  });
  return data !== false;
}

const uploadSchema = z.object({
  storeId: z.string().uuid(),
  /** JPEG image encoded as a data URL. */
  dataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
});

/**
 * Customers on a public shop page upload their selfie through this function
 * instead of writing to storage directly, so the bucket stays private and
 * every object lands under a verified store's folder.
 */
export const uploadDesignSelfie = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("id", data.storeId)
      .maybeSingle();
    if (storeError) throw new Error("Could not check this shop right now");
    if (!store) throw new Error("This shop does not exist");

    if (!(await withinUploadRateLimit(supabaseAdmin, data.storeId))) {
      throw new Error("Too many photo uploads for this shop right now — try again in an hour.");
    }

    const base64 = data.dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength === 0) throw new Error("That photo appears to be empty");
    if (bytes.byteLength > MAX_BYTES) throw new Error("That photo is too large");

    const path = `${data.storeId}/selfies/${crypto.randomUUID()}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error("Could not upload your photo");

    return { path };
  });

const fabricUploadSchema = z.object({
  storeId: z.string().uuid(),
  /** JPEG image encoded as a data URL. */
  dataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
});

/**
 * A guest measure-link submission's fabric photo. Uploaded server-side and
 * shares the same private bucket/read policy as design selfies (store
 * members only) rather than opening a new one for a single extra photo type.
 */
export const uploadFabricPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => fabricUploadSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("id", data.storeId)
      .maybeSingle();
    if (storeError) throw new Error("Could not check this shop right now");
    if (!store) throw new Error("This shop does not exist");

    if (!(await withinUploadRateLimit(supabaseAdmin, data.storeId))) {
      throw new Error("Too many photo uploads for this shop right now — try again in an hour.");
    }

    const base64 = data.dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength === 0) throw new Error("That photo appears to be empty");
    if (bytes.byteLength > MAX_BYTES) throw new Error("That photo is too large");

    const path = `${data.storeId}/fabric/${crypto.randomUUID()}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error("Could not upload your photo");

    return { path };
  });

export type SharedDesign = {
  id: string;
  store_name: string;
  client_name: string;
  description: string;
  measurements: Record<string, string>;
  image_url: string;
  created_at: string;
};

/**
 * Public share link. Only the generated design image is exposed (never the
 * customer's selfie), through a short-lived signed URL.
 */
export const getSharedDesign = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(data))
  .handler(async ({ data }): Promise<SharedDesign | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: design, error } = await supabaseAdmin
      .from("ai_designs")
      .select("id, client_name, description, measurements, image_url, created_at, stores(name)")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error("Could not load this design");
    if (!design) return null;

    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(toStoragePath(design.image_url), SIGNED_URL_TTL);

    return {
      id: design.id,
      store_name: (design.stores as { name: string } | null)?.name ?? "",
      client_name: design.client_name,
      description: design.description,
      measurements: (design.measurements as Record<string, string>) ?? {},
      image_url: signed?.signedUrl ?? "",
      created_at: design.created_at,
    };
  });
