import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSignInSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Invalid phone number"),
  password: z.string().min(1).max(200),
});

type PhoneSignInResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false };

/**
 * Signs in with a WhatsApp number + password entirely on the server.
 * The phone -> email lookup never leaves the server, and the caller only
 * receives a session when the password is correct — so the account's email
 * address can't be discovered by guessing phone numbers.
 */
export const signInWithPhone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => phoneSignInSchema.parse(data))
  .handler(async ({ data }): Promise<PhoneSignInResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    const { data: email, error } = await supabaseAdmin.rpc("resolve_login_email", {
      p_phone: data.phone,
    });
    if (error) {
      console.error("[signInWithPhone] lookup failed", error.message);
      return { ok: false };
    }
    if (!email) return { ok: false };

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return { ok: false };

    const client = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: email as string,
      password: data.password,
    });
    if (signInError || !signIn.session) return { ok: false };

    return {
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
