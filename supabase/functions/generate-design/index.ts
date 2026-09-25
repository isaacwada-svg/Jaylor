import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, generateImage, jsonResponse } from "../_shared/ai.ts";
import { AiGatewayBlockedError, gateAndLogImageCall } from "../_shared/ai-gateway.ts";

const DESIGN_FEE_KOBO = 30000; // ₦300
const BUCKET = "ai-design-photos";
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_STYLE_REFS = 3;

type RequestBody = {
  storeId: string;
  clientName: string;
  phone: string;
  description: string;
  measurements?: Record<string, string>;
  /** Object path inside the private ai-design-photos bucket. */
  selfiePath?: string | null;
  /** Object paths of the customer's own style reference photos, same bucket. */
  styleReferencePaths?: string[];
};

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Accepts either a bare storage path or a legacy full public URL. */
function toStoragePath(value: string): string {
  const marker = `/${BUCKET}/`;
  const at = value.indexOf(marker);
  return at === -1 ? value.replace(/^\/+/, "") : value.slice(at + marker.length);
}

async function signPath(
  supabase: ReturnType<typeof serviceClient>,
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(toStoragePath(path), SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

async function uploadGeneratedImage(
  supabase: ReturnType<typeof serviceClient>,
  storeId: string,
  dataUrl: string,
): Promise<string> {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("AI returned an unexpected image format");
  const [, contentType, base64] = match;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = contentType.split("/")[1] ?? "png";
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const hasStyleRefs = (body.styleReferencePaths ?? []).length > 0;
  if (
    !body.storeId ||
    !body.clientName?.trim() ||
    !body.phone?.trim() ||
    (!body.description?.trim() && !hasStyleRefs)
  ) {
    return errorResponse(
      "storeId, clientName, phone and a description or reference photo are required",
    );
  }

  if (
    body.clientName.length > 120 ||
    (body.description?.length ?? 0) > 2000 ||
    !/^\+?[0-9]{8,15}$/.test(body.phone.trim())
  ) {
    return errorResponse("Please check your details and try again");
  }

  const supabase = serviceClient();

  // Public guest feature: only real, active shops on a plan that includes AI designs.
  const { data: store } = await supabase
    .from("stores")
    .select("id, is_active")
    .eq("id", body.storeId)
    .maybeSingle();
  if (!store || !store.is_active) return errorResponse("Shop not found", 404);
  const { data: planCode } = await supabase.rpc("effective_plan_code", {
    _store_id: body.storeId,
  });
  const { data: plan } = await supabase
    .from("plans")
    .select("features")
    .eq("code", (planCode as string | null) ?? "")
    .maybeSingle();
  const features = (plan?.features ?? {}) as Record<string, unknown>;
  if (!plan || features["ai_designs"] === false || features["style_cards"] === false) {
    return errorResponse("This shop doesn't offer AI design previews", 403);
  }

  // The selfie must belong to this store's folder in the private bucket.
  let selfiePath: string | null = null;
  if (body.selfiePath) {
    const candidate = toStoragePath(body.selfiePath);
    if (!candidate.startsWith(`${body.storeId}/`)) {
      return errorResponse("That photo does not belong to this shop", 400);
    }
    selfiePath = candidate;
  }

  // Same ownership check for each style reference photo, capped so a single
  // request can't balloon the image-generation call with dozens of images.
  const styleRefPaths: string[] = [];
  for (const raw of (body.styleReferencePaths ?? []).slice(0, MAX_STYLE_REFS)) {
    const candidate = toStoragePath(raw);
    if (!candidate.startsWith(`${body.storeId}/`)) {
      return errorResponse("That photo does not belong to this shop", 400);
    }
    styleRefPaths.push(candidate);
  }

  try {
    const { data: withinLimit } = await supabase.rpc("check_rate_limit", {
      p_bucket: "ai_design_request",
      p_key: body.phone,
      p_max_count: 5,
      p_window_minutes: 60,
    });
    if (withinLimit === false) {
      return errorResponse("Too many design requests — try again in an hour.", 429);
    }
  } catch {
    // If the rate limiter itself isn't reachable, fail open rather than block a real customer.
  }

  // The phone number above is self-reported and free to change on every request, so also
  // rate-limit by the caller's network address to slow down anyone resetting their free quota
  // by simply typing a different number each time.
  const clientIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    const { data: ipWithinLimit } = await supabase.rpc("check_rate_limit", {
      p_bucket: "ai_design_request_ip",
      p_key: clientIp,
      p_max_count: 8,
      p_window_minutes: 60,
    });
    if (ipWithinLimit === false) {
      return errorResponse(
        "Too many design requests from this device — try again in an hour.",
        429,
      );
    }
  } catch {
    // Fail open if the rate limiter itself isn't reachable.
  }

  // Bound a single store's total exposure to abuse regardless of who's asking, since neither
  // the phone number nor (behind a shared network) the IP address is a reliable identity here.
  const { count: storeDailyCount } = await supabase
    .from("ai_designs")
    .select("id", { count: "exact", head: true })
    .eq("store_id", body.storeId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((storeDailyCount ?? 0) >= 40) {
    return errorResponse(
      "This shop has reached its daily design preview limit. Please try again tomorrow.",
      429,
    );
  }

  const { count: freeUsed } = await supabase
    .from("ai_designs")
    .select("id", { count: "exact", head: true })
    .eq("phone", body.phone);

  let paymentId: string | null = null;
  let wasPaid = false;

  if ((freeUsed ?? 0) > 0) {
    const { data: payment } = await supabase
      .from("ai_design_payments")
      .select("id")
      .eq("phone", body.phone)
      .eq("status", "success")
      .eq("used", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return jsonResponse({ payment_required: true, amount: DESIGN_FEE_KOBO });
    }
    paymentId = payment.id;
    wasPaid = true;
  }

  const measurementsText = body.measurements
    ? Object.entries(body.measurements)
        .filter(([, v]) => v?.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const descriptionText = body.description?.trim() || "";
  const promptText = `Create a photorealistic fashion photograph of a custom-tailored Nigerian outfit, suitable for a real tailor to sew.${
    descriptionText
      ? ` Style brief from the customer: "${descriptionText}".`
      : " The customer has not written a style brief — base the design entirely on the attached reference photo(s) below."
  }${
    measurementsText
      ? ` Approximate body measurements for proportion reference: ${measurementsText}.`
      : ""
  } Show the full outfit clearly on a person in a neutral studio setting, good lighting, realistic fabric texture. This is a design reference for a tailor, not a fantasy illustration.`;

  const parts: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: promptText }];
  if (selfiePath) {
    const signedSelfie = await signPath(supabase, selfiePath);
    if (signedSelfie) {
      parts.push({
        type: "text",
        text: "Use the attached photo as a reference for the person's face and body.",
      });
      parts.push({ type: "image_url", image_url: { url: signedSelfie } });
    }
  }
  if (styleRefPaths.length > 0) {
    parts.push({
      type: "text",
      text: "Use the following attached photo(s) as a style reference for the garment/outfit the customer wants — match the cut, silhouette and details shown, adapted to the fabric and measurements described above.",
    });
    for (const path of styleRefPaths) {
      const signed = await signPath(supabase, path);
      if (signed) parts.push({ type: "image_url", image_url: { url: signed } });
    }
  }

  try {
    const dataUrl = await gateAndLogImageCall({
      supabase,
      storeId: body.storeId,
      userId: null, // customer-facing public form — no signed-in staff user to attribute this to
      featureKey: "style_cards",
      run: () => generateImage(parts),
    });
    const imagePath = await uploadGeneratedImage(supabase, body.storeId, dataUrl);

    const { data: design, error: insertError } = await supabase
      .from("ai_designs")
      .insert({
        store_id: body.storeId,
        client_name: body.clientName.trim(),
        phone: body.phone,
        description: descriptionText || "Styled from an attached reference photo",
        measurements: body.measurements ?? {},
        selfie_url: selfiePath,
        style_reference_urls: styleRefPaths.length ? styleRefPaths : null,
        image_url: imagePath,
        was_paid: wasPaid,
        payment_id: paymentId,
      })
      .select("id, image_url, share_token")
      .single();
    if (insertError) throw insertError;

    if (paymentId) {
      await supabase.from("ai_design_payments").update({ used: true }).eq("id", paymentId);
    }

    const signedImage = await signPath(supabase, imagePath);

    return jsonResponse({
      result: { ...design, image_url: signedImage ?? "" },
    });
  } catch (error) {
    if (error instanceof AiGatewayBlockedError) return errorResponse(error.message, 429);
    console.error("[generate-design]", error);
    return errorResponse("Could not generate this design", 500);
  }
});
