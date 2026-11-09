import { createFileRoute } from "@tanstack/react-router";
import { notifyPlatformAdmin, type PlatformAlertKind } from "@/lib/platform-admin-alert.server";

// Relay for platform-admin email alerts (new signup, payment/security
// events). Called the same way as /api/internal/transfer-alert: from a
// Postgres trigger via net.http_post (new store signup, RLS drift check
// failure) and directly from the paystack-webhook edge function (invalid
// signature, dedicated-account failure). Same INTERNAL_API_SECRET as both.
const VALID_KINDS: PlatformAlertKind[] = [
  "signup",
  "webhook_signature_invalid",
  "dedicated_account_failed",
  "rls_drift",
];

export const Route = createFileRoute("/api/internal/platform-alert")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["INTERNAL_API_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        if (request.headers.get("X-Internal-Secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { kind?: string; details?: Record<string, string | number | null> };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        if (!body.kind || !VALID_KINDS.includes(body.kind as PlatformAlertKind)) {
          return new Response(`kind must be one of ${VALID_KINDS.join(", ")}`, { status: 400 });
        }

        const sent = await notifyPlatformAdmin(body.kind as PlatformAlertKind, body.details ?? {});
        return new Response(JSON.stringify({ sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
