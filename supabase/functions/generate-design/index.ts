import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, errorResponse, generateImage, jsonResponse } from "../_shared/ai.ts";

const DESIGN_FEE_KOBO = 30000; // ₦300

type RequestBody = {
  storeId: string;
  clientName: string;
  phone: string;
  description: string;
  measurements?: Record<string, string>;
  selfieUrl?: string | null;
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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
    .from("ai-design-photos")
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("ai-design-photos").getPublicUrl(path);
  return data.publicUrl;
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
  if (!body.storeId || !body.clientName?.trim() || !body.phone?.trim() || !body.description?.trim()) {
    return errorResponse("storeId, clientName, phone and description are required");
  }

  const supabase = serviceClient();

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

  const promptText = `Create a photorealistic fashion photograph of a custom-tailored Nigerian outfit, suitable for a real tailor to sew. Style brief from the customer: "${body.description.trim()}".${
    measurementsText ? ` Approximate body measurements for proportion reference: ${measurementsText}.` : ""
  } Show the full outfit clearly on a person in a neutral studio setting, good lighting, realistic fabric texture. This is a design reference for a tailor, not a fantasy illustration.`;

  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: promptText },
  ];
  if (body.selfieUrl) {
    parts.push({ type: "text", text: "Use the attached photo as a reference for the person's face and body." });
    parts.push({ type: "image_url", image_url: { url: body.selfieUrl } });
  }

  try {
    const dataUrl = await generateImage(parts);
    const imageUrl = await uploadGeneratedImage(supabase, body.storeId, dataUrl);

    const { data: design, error: insertError } = await supabase
      .from("ai_designs")
      .insert({
        store_id: body.storeId,
        client_name: body.clientName.trim(),
        phone: body.phone,
        description: body.description.trim(),
        measurements: body.measurements ?? {},
        selfie_url: body.selfieUrl ?? null,
        image_url: imageUrl,
        was_paid: wasPaid,
        payment_id: paymentId,
      })
      .select("id, image_url, share_token")
      .single();
    if (insertError) throw insertError;

    if (paymentId) {
      await supabase.from("ai_design_payments").update({ used: true }).eq("id", paymentId);
    }

    return jsonResponse({ result: design });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not generate this design", 500);
  }
});
