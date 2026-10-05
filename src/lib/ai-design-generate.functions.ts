// Public, guest-facing AI style preview on a shop's storefront page --
// moved off the Lovable gateway (generate-design edge function) onto
// Gemini direct, same as every other AI feature. Unlike the store-wallet
// features in ai-run.server.ts, this one is paid per-use by the guest
// customer (first preview free after phone verification, a flat ₦300
// Paystack fee after that via create-design-payment/verify-design-payment,
// both unchanged) rather than drawn from a store's AI credit wallet -- so
// it records its real provider cost straight into ai_ledger for admin cost
// visibility instead of going through reserve/charge/refund.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { callGemini, downloadAsPart, getAiConfig, FriendlyError, type Part } from "./ai-run.server";
import { maybeAlertAiWalletBudget } from "./ai-budget-alert.server";

const DESIGN_FEE_KOBO = 30000; // ₦300
const BUCKET = "ai-design-photos";
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_STYLE_REFS = 3;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type GenerateResult =
  | { payment_required: true; amount: number }
  | { verification_required: true }
  | { result: { id: string; image_url: string; share_token: string } };

/** Accepts either a bare storage path or a legacy full public URL. */
function toStoragePath(value: string): string {
  const marker = `/${BUCKET}/`;
  const at = value.indexOf(marker);
  return at === -1 ? value.replace(/^\/+/, "") : value.slice(at + marker.length);
}

function clientIp(): string {
  const headers = getRequest()?.headers;
  return (
    headers?.get("cf-connecting-ip") ??
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers?.get("x-real-ip") ??
    "unknown"
  );
}

const inputSchema = z.object({
  storeId: z.string().uuid(),
  clientName: z.string().min(1).max(120),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  description: z.string().max(2000).default(""),
  measurements: z.record(z.string(), z.string()).default({}),
  selfiePath: z.string().max(300).nullable().default(null),
  styleReferencePaths: z.array(z.string().max(300)).max(MAX_STYLE_REFS).default([]),
  paymentReference: z.string().max(100).nullable().optional(),
});

export const generateGuestDesign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const hasStyleRefs = data.styleReferencePaths.length > 0;
    if (!data.description.trim() && !hasStyleRefs) {
      throw new Error("Describe the style or attach a reference photo");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const { data: store } = await db
      .from("stores")
      .select("id, is_active")
      .eq("id", data.storeId)
      .maybeSingle();
    if (!store || !store.is_active) throw new Error("Shop not found");
    const { data: planCode } = await db.rpc("effective_plan_code", { _store_id: data.storeId });
    const { data: plan } = await db
      .from("plans")
      .select("features")
      .eq("code", planCode ?? "")
      .maybeSingle();
    const features = (plan?.features ?? {}) as Record<string, unknown>;
    if (!plan || features["ai_designs"] === false || features["style_cards"] === false) {
      throw new Error("This shop doesn't offer AI design previews");
    }

    // Photos must be fresh uploads from this request's own upload step --
    // exactly the path shape uploadDesignSelfie/uploadDesignStyleRef create,
    // never a path already attached to an earlier design (which would let
    // someone reuse another customer's photo).
    const escStore = data.storeId.replace(/[^0-9a-f-]/gi, "");
    const selfieRe = new RegExp(`^${escStore}/selfies/${UUID}\\.jpg$`, "i");
    const styleRe = new RegExp(`^${escStore}/style-refs/${UUID}\\.jpg$`, "i");

    let selfiePath: string | null = null;
    if (data.selfiePath) {
      const candidate = toStoragePath(data.selfiePath);
      if (!selfieRe.test(candidate)) throw new Error("That photo does not belong to this shop");
      selfiePath = candidate;
    }
    const styleRefPaths: string[] = [];
    for (const raw of data.styleReferencePaths) {
      const candidate = toStoragePath(raw);
      if (!styleRe.test(candidate)) throw new Error("That photo does not belong to this shop");
      styleRefPaths.push(candidate);
    }
    if (selfiePath) {
      const { count } = await db
        .from("ai_designs")
        .select("id", { count: "exact", head: true })
        .eq("selfie_url", selfiePath);
      if ((count ?? 0) > 0) throw new Error("Please upload your photo again");
    }
    for (const p of styleRefPaths) {
      const { count } = await db
        .from("ai_designs")
        .select("id", { count: "exact", head: true })
        .contains("style_reference_urls", [p]);
      if ((count ?? 0) > 0) throw new Error("Please upload your photo again");
    }

    try {
      const { data: withinLimit } = await db.rpc("check_rate_limit", {
        p_bucket: "ai_design_request",
        p_key: data.phone,
        p_max_count: 5,
        p_window_minutes: 60,
      });
      if (withinLimit === false)
        throw new Error("Too many design requests — try again in an hour.");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Too many")) throw e;
      // Fail open if the rate limiter itself isn't reachable.
    }
    try {
      const { data: ipWithinLimit } = await db.rpc("check_rate_limit", {
        p_bucket: "ai_design_request_ip",
        p_key: clientIp(),
        p_max_count: 8,
        p_window_minutes: 60,
      });
      if (ipWithinLimit === false)
        throw new Error("Too many design requests from this device — try again in an hour.");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Too many")) throw e;
      // Fail open if the rate limiter itself isn't reachable.
    }

    const { count: storeDailyCount } = await db
      .from("ai_designs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", data.storeId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if ((storeDailyCount ?? 0) >= 40) {
      throw new Error(
        "This shop has reached its daily design preview limit. Please try again tomorrow.",
      );
    }

    const { count: freeUsed } = await db
      .from("ai_designs")
      .select("id", { count: "exact", head: true })
      .eq("phone", data.phone);
    let paymentId: string | null = null;
    let wasPaid = false;

    if ((freeUsed ?? 0) > 0) {
      const reference = data.paymentReference ?? "";
      if (!reference.startsWith("design_"))
        return { payment_required: true, amount: DESIGN_FEE_KOBO };
      const { data: payment } = await db
        .from("ai_design_payments")
        .select("id")
        .eq("reference", reference)
        .eq("phone", data.phone)
        .eq("status", "success")
        .eq("used", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!payment) return { payment_required: true, amount: DESIGN_FEE_KOBO };
      paymentId = payment.id;
      wasPaid = true;
    } else {
      // Free preview: require proof the caller actually holds this phone
      // number before spending real image-generation cost on it -- a
      // self-reported number alone is trivially reset by typing a
      // different one each time.
      const phoneDigits = data.phone.replace(/\D/g, "");
      const { data: verification } = await db
        .from("ai_design_phone_verifications")
        .select("id")
        .eq("phone", phoneDigits)
        .not("verified_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (!verification) return { verification_required: true };
    }

    const measurementsText = Object.entries(data.measurements)
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    const descriptionText = data.description.trim();
    const promptText = `Create a photorealistic fashion photograph of a custom-tailored Nigerian outfit, suitable for a real tailor to sew.${
      descriptionText
        ? ` Style brief from the customer: "${descriptionText}".`
        : " The customer has not written a style brief — base the design entirely on the attached reference photo(s) below."
    }${
      measurementsText
        ? ` Approximate body measurements for proportion reference: ${measurementsText}.`
        : ""
    } Show the full outfit clearly on a person in a neutral studio setting, good lighting, realistic fabric texture. This is a design reference for a tailor, not a fantasy illustration.`;

    const parts: Part[] = [{ text: promptText }];
    if (selfiePath) {
      parts.push({ text: "Use the attached photo as a reference for the person's face and body." });
      parts.push(await downloadAsPart(db, BUCKET, selfiePath));
    }
    if (styleRefPaths.length > 0) {
      parts.push({
        text: "Use the following attached photo(s) as a style reference for the garment/outfit the customer wants — match the cut, silhouette and details shown, adapted to the fabric and measurements described above.",
      });
      for (const p of styleRefPaths) parts.push(await downloadAsPart(db, BUCKET, p));
    }

    const config = await getAiConfig(db);
    const model = String(config["model_image"] ?? "gemini-3.1-flash-image");

    try {
      const g = await callGemini(process.env["GEMINI_API_KEY"] ?? "", model, parts, {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      });
      if (!g.image)
        throw new FriendlyError("The AI didn't return a picture. Please try again.", "NO_IMAGE");

      const bytes = Uint8Array.from(atob(g.image.data), (c) => c.charCodeAt(0));
      const ext = g.image.mimeType.includes("jpeg") ? "jpg" : "png";
      const imagePath = `${data.storeId}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage
        .from(BUCKET)
        .upload(imagePath, bytes, { contentType: g.image.mimeType, upsert: false });
      if (up.error)
        throw new FriendlyError("We couldn't save the picture. Please try again.", "STORAGE");

      const { data: design, error: insertError } = await db
        .from("ai_designs")
        .insert({
          store_id: data.storeId,
          client_name: data.clientName.trim(),
          phone: data.phone,
          description: descriptionText || "Styled from an attached reference photo",
          measurements: data.measurements,
          selfie_url: selfiePath,
          style_reference_urls: styleRefPaths.length ? styleRefPaths : null,
          image_url: imagePath,
          was_paid: wasPaid,
          payment_id: paymentId,
        })
        .select("id, image_url, share_token")
        .single();
      if (insertError)
        throw new FriendlyError("Could not save this design. Please try again.", "ERROR");

      if (paymentId) {
        await db
          .from("ai_design_payments")
          .update({ used: true })
          .eq("id", paymentId)
          .eq("used", false);
      }

      const costUsd =
        (g.inputTokens / 1e6) * Number(config["price_text_input_per_m_usd"] ?? 0) +
        Number(config["price_image_usd"] ?? 0);
      const fxRate = Number(config["fx_rate_ngn_per_usd"] ?? 1600);
      await db.from("ai_ledger").insert({
        store_id: data.storeId,
        user_id: null,
        feature_key: "ai_design_guest",
        credits: 0,
        source: "guest_payment",
        status: "charged",
        model,
        input_tokens: g.inputTokens,
        output_tokens: g.outputTokens,
        est_cost_usd: costUsd,
        est_cost_ngn: costUsd * fxRate,
      });
      void maybeAlertAiWalletBudget(db);

      const { data: signed } = await db.storage
        .from(BUCKET)
        .createSignedUrl(imagePath, SIGNED_URL_TTL);
      return { result: { ...design, image_url: signed?.signedUrl ?? "" } };
    } catch (error) {
      console.error("[generateGuestDesign]", error);
      // Never surface raw provider error text to a guest customer.
      const message =
        error instanceof FriendlyError
          ? error.message
          : "Could not generate this design. Please try again.";
      throw new Error(message);
    }
  });
