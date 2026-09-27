import { createFileRoute } from "@tanstack/react-router";
import { sendTransferAlert } from "@/lib/digest.server";

// Called by the paystack-webhook Deno edge function right after it
// auto-matches an incoming transfer to an order -- see that function's
// notifyTransferMatched(). Also usable for the manual-assign path, though
// unmatched-payments.tsx currently calls sendTransferAlert directly via a
// server function instead (no HTTP hop needed there).
export const Route = createFileRoute("/api/internal/transfer-alert")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["INTERNAL_API_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        if (request.headers.get("X-Internal-Secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { storeId?: string; orderId?: string; transferId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        if (!body.storeId || !body.orderId || !body.transferId) {
          return new Response("storeId, orderId and transferId are required", { status: 400 });
        }

        const result = await sendTransferAlert(body.storeId, body.orderId, body.transferId);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
