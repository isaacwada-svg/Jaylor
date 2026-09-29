import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type VoiceNoteResult = {
  id: string;
  transcript: string | null;
  transcriptEnglish: string | null;
  language: string | null;
  freeLeftToday: number;
  notice: string | null;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function dayStartIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** How many free voice transcriptions this shop has left today. */
export const getVoiceAllowance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: cfg } = await sb.from("ai_config").select("value").eq("key", "voice_free_daily_per_store").maybeSingle();
    const limit = Number(cfg?.value ?? 20);
    const { count } = await sb
      .from("voice_transcription_log")
      .select("id", { count: "exact", head: true })
      .eq("store_id", data.storeId)
      .gte("created_at", dayStartIso());
    return { limit, used: count ?? 0, left: Math.max(0, limit - (count ?? 0)) };
  });

/**
 * Saves a recorded voice note to an order/client and writes it down for free
 * (daily limit per shop). Understands English, Pidgin, Yoruba, Hausa, Igbo and
 * other languages, and adds an English version. The voice note is always kept,
 * even when the free limit is reached or the AI fails.
 */
export const saveVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storeId: z.string().uuid(),
        path: z.string().min(10).max(300),
        orderId: z.string().uuid().optional(),
        clientId: z.string().uuid().optional(),
        seconds: z.number().int().min(1).max(120),
        sizeBytes: z.number().int().min(1).max(10_485_760),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<VoiceNoteResult> => {
    if (!data.path.startsWith(`${data.storeId}/voice/`) || data.path.includes("..")) throw new Error("Invalid file");
    const { data: member } = await context.supabase
      .from("store_members")
      .select("status")
      .eq("store_id", data.storeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || member.status !== "active") throw new Error("You don't have access to this shop");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: cfgRows } = await db.from("ai_config").select("key, value");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg: any = {};
    for (const r of cfgRows ?? []) cfg[r.key] = r.value;
    const limit = Number(cfg.voice_free_daily_per_store ?? 20);
    const { count } = await db
      .from("voice_transcription_log")
      .select("id", { count: "exact", head: true })
      .eq("store_id", data.storeId)
      .gte("created_at", dayStartIso());
    const usedToday = count ?? 0;

    let transcript: string | null = null;
    let english: string | null = null;
    let language: string | null = null;
    let notice: string | null = null;
    let logged = false;

    const apiKey = process.env["GEMINI_API_KEY"];
    const { data: todayLedger } = await db.from("ai_ledger").select("est_cost_usd").gte("created_at", dayStartIso());
    const spent = (todayLedger ?? []).reduce((s: number, r: { est_cost_usd: number | null }) => s + Number(r.est_cost_usd ?? 0), 0);

    if (cfg.ai_enabled === false || !apiKey) {
      notice = "Voice note saved. Writing it down isn't switched on yet.";
    } else if (usedToday >= limit) {
      notice = `Voice note saved. You've used today's ${limit} free write-ups; they come back tomorrow.`;
    } else if (spent >= Number(cfg.global_daily_cap_usd ?? 10)) {
      notice = "Voice note saved. Writing it down is busy right now, please try again tomorrow.";
    } else {
      try {
        const { data: file, error } = await db.storage.from("attachments").download(data.path);
        if (error || !file) throw new Error("download failed");
        const audio = toBase64(new Uint8Array(await file.arrayBuffer()));
        const model = String(cfg.model_text ?? "gemini-3.1-flash-lite");
        const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      "This is a voice note from a Nigerian tailor about a customer's order. It may be in English, Nigerian Pidgin, Yoruba, Hausa, Igbo, another Nigerian language, or a mix. " +
                      "Write down exactly what was said in the original language, then give a plain English version. Keep numbers, measurements, dates and prices exact. " +
                      'Reply ONLY with JSON: {"language":"main language name","transcript":"what was said","english":"English version"}. If nothing was said, use empty strings.',
                  },
                  { inlineData: { mimeType: "audio/wav", data: audio } },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        if (!res.ok) {
          console.error("voice transcription failed", res.status, (await res.text()).slice(0, 300));
          throw new Error("ai failed");
        }
        const body = await res.json();
        const text = (body?.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => p.text ?? "")
          .join("");
        const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
        transcript = String(parsed.transcript ?? "").slice(0, 4000) || null;
        english = String(parsed.english ?? "").slice(0, 4000) || null;
        language = String(parsed.language ?? "").slice(0, 40) || null;
        if (!transcript) notice = "Voice note saved. We couldn't hear any words in it.";
        const inTok = Number(body?.usageMetadata?.promptTokenCount ?? 0);
        const outTok = Number(body?.usageMetadata?.candidatesTokenCount ?? 0);
        const cost =
          (inTok / 1e6) * Number(cfg.price_text_input_per_m_usd ?? 0.25) +
          (outTok / 1e6) * Number(cfg.price_text_output_per_m_usd ?? 1.5);
        await db.from("voice_transcription_log").insert({
          store_id: data.storeId,
          user_id: context.userId,
          seconds: data.seconds,
          input_tokens: inTok,
          output_tokens: outTok,
          est_cost_usd: cost,
        });
        logged = true;
      } catch {
        notice = "Voice note saved. We couldn't write it down this time.";
      }
    }

    const { data: row, error: insErr } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("order_attachments" as any)
      .insert({
        store_id: data.storeId,
        order_id: data.orderId ?? null,
        client_id: data.clientId ?? null,
        kind: "voice",
        path: data.path,
        file_name: `Voice note (${data.seconds}s)`,
        mime_type: "audio/wav",
        size_bytes: data.sizeBytes,
        duration_seconds: data.seconds,
        transcript,
        transcript_english: english,
        language,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error("Couldn't save the voice note");

    return {
      id: (row as unknown as { id: string }).id,
      transcript,
      transcriptEnglish: english,
      language,
      freeLeftToday: Math.max(0, limit - usedToday - (logged ? 1 : 0)),
      notice,
    };
  });
