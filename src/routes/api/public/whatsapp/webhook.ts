import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { applyMessageStatus, extractStatuses } from "@/lib/whatsapp-send.server";
import { issueLoginCode, touchContactWindow } from "@/lib/portal-login.server";
import { tryConsumeAiDesignVerification } from "@/lib/ai-design-verification.server";

type InboundMessage = { id?: string; from?: string; type?: string; text?: { body?: string } };

function extractMessages(payload: unknown): InboundMessage[] {
  const value = (
    payload as {
      entry?: Array<{ changes?: Array<{ value?: { messages?: InboundMessage[] } }> }>;
    }
  )?.entry?.[0]?.changes?.[0]?.value;
  return value?.messages ?? [];
}

const LOGIN_INTENT = /(jaylor\s*login|sign\s*in|log\s*in|my\s*code|code)/i;

async function processDelivery(event: string, payload: unknown) {
  if (event === "whatsapp.status") {
    for (const status of extractStatuses(payload)) {
      await applyMessageStatus(status.id, status.status, status.error);
    }
    return;
  }

  if (event === "whatsapp.message") {
    for (const message of extractMessages(payload)) {
      const from = (message.from ?? "").replace(/\D/g, "");
      if (!from) continue;
      await touchContactWindow(from);
      const body = message.text?.body ?? "";
      if (message.type === "text") {
        if (LOGIN_INTENT.test(body)) await issueLoginCode(from);
        await tryConsumeAiDesignVerification(from, body);
      }
    }
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 500 });

        const verified = await verifyWebhookRequest({
          req: request,
          secret,
          maxBodyBytes: 4 * 1024 * 1024,
        }).catch(() => null);
        if (!verified) return new Response("Invalid signature", { status: 401 });

        const deliveryId = request.headers.get("X-Lovable-Delivery");
        const event = request.headers.get("X-Lovable-Event");
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });

        let payload: unknown;
        try {
          payload = JSON.parse(verified.body ?? "{}");
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: insertError } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .insert({ delivery_id: deliveryId, event, payload: payload as never });
        if (insertError && insertError.code !== "23505") {
          console.error("Webhook store failed", insertError);
          return new Response("Store failed", { status: 500 });
        }

        const { data: row, error: readError } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select("id, processed_at")
          .eq("delivery_id", deliveryId)
          .maybeSingle();
        if (readError || !row) return new Response("Store failed", { status: 500 });
        if (row.processed_at) return new Response("ok");

        try {
          await processDelivery(event, payload);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Processing failed";
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({ processing_error: message.slice(0, 2000) })
            .eq("id", row.id);
          return new Response("Processing failed", { status: 500 });
        }

        await supabaseAdmin
          .from("whatsapp_webhook_events")
          .update({ processed_at: new Date().toISOString(), processing_error: null })
          .eq("id", row.id);

        return new Response("ok");
      },
    },
  },
});
