import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Invalid phone number"),
});

/**
 * Resolves a WhatsApp/phone number to the account's login email.
 * Runs server-side only so the phone -> email lookup is not exposed to the
 * public API (which would allow account enumeration).
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => phoneSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: email, error } = await supabaseAdmin.rpc("resolve_login_email", {
      p_phone: data.phone,
    });
    if (error) {
      console.error("[resolveLoginEmail] lookup failed", error.message);
      return { email: null as string | null };
    }
    return { email: (email as string | null) ?? null };
  });
