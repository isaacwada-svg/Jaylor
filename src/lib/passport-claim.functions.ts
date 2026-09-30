import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalisePhone, PORTAL_KEYWORD } from "@/lib/portal-phone";
import { normalizePhoneNG } from "@/lib/phone";
import { SHOP_WHATSAPP } from "@/lib/portal.functions";

const phoneSchema = z.object({ phone: z.string().min(6) });

export type RequestPassportCodeResult =
  | { status: "sent" }
  | { status: "needs_message"; whatsappLink: string }
  | { status: "error"; error: string };

/** Step 1 — send a one-time code on WhatsApp, reusing the exact same
 *  portal_login_codes table, hasOpenWindow()/issueLoginCode()/sendWhatsAppText()
 *  the customer portal already uses (including the "message us first" fallback
 *  WhatsApp requires outside an open 24h window — skipping that check would
 *  silently fail to deliver a code to anyone who's never messaged Jaylor
 *  before). A WhatsApp-verified phone is the same proof of identity either
 *  way, so this deliberately does not add a second code system. Same
 *  response whether or not the phone has any Passport records — nothing here
 *  checks that, so there's nothing to enumerate. */
export const requestPassportCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => phoneSchema.parse(data))
  .handler(async ({ data }): Promise<RequestPassportCodeResult> => {
    const codePhone = normalisePhone(data.phone);
    const e164 = normalizePhoneNG(data.phone);
    if (!codePhone || !e164) {
      return { status: "error", error: "Enter a valid Nigerian phone number" };
    }

    const { hasOpenWindow, issueLoginCode } = await import("@/lib/portal-login.server");
    const whatsappLink = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(PORTAL_KEYWORD)}`;

    if (!(await hasOpenWindow(codePhone))) {
      return { status: "needs_message", whatsappLink };
    }

    const sent = await issueLoginCode(codePhone);
    if (!sent.ok) {
      if (sent.error?.includes("Too many")) return { status: "error", error: sent.error };
      return { status: "needs_message", whatsappLink };
    }
    return { status: "sent" };
  });

const verifySchema = z.object({ phone: z.string().min(6), code: z.string().min(4).max(8) });

/** Step 2 — check the code against the same portal_login_codes row, then
 *  mint a Passport-specific session (passport_start_session) rather than a
 *  portal_sessions row, since Passport access is a different, holder-scoped
 *  identity concept from the stateless portal lookup. */
export const verifyPassportCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }> => {
      const codePhone = normalisePhone(data.phone);
      const e164 = normalizePhoneNG(data.phone);
      if (!codePhone || !e164) {
        return { ok: false, error: "Enter a valid Nigerian phone number" };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { hashCode } = await import("@/lib/portal-login.server");

      const { data: row } = await supabaseAdmin
        .from("portal_login_codes")
        .select("id, code_hash, expires_at, attempts, consumed_at")
        .eq("phone", codePhone)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return { ok: false, error: "Ask for a new code — this one is no longer valid" };
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, error: "That code has expired. Ask for a new one." };
      }
      if (row.attempts >= 5) {
        return { ok: false, error: "Too many wrong tries. Ask for a new code." };
      }

      const expected = await hashCode(codePhone, data.code.trim());
      if (expected !== row.code_hash) {
        await supabaseAdmin
          .from("portal_login_codes")
          .update({ attempts: row.attempts + 1 })
          .eq("id", row.id);
        return { ok: false, error: "That code is not correct" };
      }

      await supabaseAdmin
        .from("portal_login_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

      const { data: sessionToken, error } = await supabaseAdmin.rpc("passport_start_session", {
        p_phone_e164: e164,
      });
      if (error || !sessionToken) {
        return { ok: false, error: "Could not verify you. Please try again." };
      }
      return { ok: true, sessionToken: sessionToken as string };
    },
  );
