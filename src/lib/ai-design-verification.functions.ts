import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalisePhone } from "@/lib/portal-phone";

/** Jaylor's own WhatsApp number -- same one used for support and the custom-plan enquiry link. */
const PLATFORM_WHATSAPP = "2349028101389";

const phoneSchema = z.object({ phone: z.string().min(6) });

/** Step 1 -- get a one-time code and the wa.me link that pre-fills it. */
export const startAiDesignVerification = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => phoneSchema.parse(input))
  .handler(async ({ data }): Promise<{ whatsappLink: string }> => {
    const phone = normalisePhone(data.phone);
    if (!phone) throw new Error("Please enter a valid phone number");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: withinLimit } = await supabaseAdmin.rpc("check_rate_limit", {
      p_bucket: "ai_design_verify_start",
      p_key: phone,
      p_max_count: 5,
      p_window_minutes: 60,
    });
    if (withinLimit === false) {
      throw new Error("Too many attempts — please try again in an hour.");
    }

    const { issueAiDesignVerificationCode } = await import("@/lib/ai-design-verification.server");
    const { code } = await issueAiDesignVerificationCode(phone);
    return { whatsappLink: `https://wa.me/${PLATFORM_WHATSAPP}?text=${encodeURIComponent(code)}` };
  });

/** Step 2 -- poll after the visitor says they've sent the message. */
export const checkAiDesignVerification = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => phoneSchema.parse(input))
  .handler(async ({ data }): Promise<{ verified: boolean }> => {
    const phone = normalisePhone(data.phone);
    if (!phone) return { verified: false };
    const { isPhoneVerifiedForAiDesign } = await import("@/lib/ai-design-verification.server");
    return { verified: await isPhoneVerifiedForAiDesign(phone) };
  });
