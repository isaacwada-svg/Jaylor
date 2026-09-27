import { createFileRoute } from "@tanstack/react-router";
import { sendDailyDigest, sendWeeklyDigest } from "@/lib/digest.server";

// Called by pg_cron (via pg_net.http_post, see the get_daily_digest_data
// migration) once a day and once a week. Lives here rather than as a
// Supabase edge function because the WhatsApp gateway secrets
// (LOVABLE_API_KEY / WHATSAPP_API_KEY) are confirmed to exist for this
// Node/TanStack app already (src/lib/whatsapp-send.server.ts uses them) --
// Deno edge function secrets are a separate store this session couldn't
// verify.
export const Route = createFileRoute("/api/cron/digest")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["INTERNAL_API_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        if (request.headers.get("X-Internal-Secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { kind?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        if (body.kind !== "daily" && body.kind !== "weekly") {
          return new Response("kind must be daily or weekly", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: stores, error } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("is_active", true);
        if (error) return new Response("Could not list stores", { status: 500 });

        const results = await Promise.allSettled(
          (stores ?? []).map((s) =>
            body.kind === "daily" ? sendDailyDigest(s.id) : sendWeeklyDigest(s.id),
          ),
        );
        const sent = results.filter((r) => r.status === "fulfilled" && !r.value.skipped).length;
        return new Response(JSON.stringify({ kind: body.kind, stores: results.length, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
