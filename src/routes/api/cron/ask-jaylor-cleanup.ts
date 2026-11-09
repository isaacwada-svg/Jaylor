import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron once a day (see the migration that adds
// advisor_messages.attachments). Deletes Ask Jaylor attachments older than
// 30 days. Storage objects can only be removed through the Storage API, not
// a raw SQL DELETE, so this -- like the daily/weekly digest -- lives here
// rather than as a pure-SQL cron job. Authenticated the same way the digest
// route is: the X-Internal-Secret header must match INTERNAL_API_SECRET.
// The cron job itself gets that value copied straight off the digest job's
// own command (see the migration that (re)schedules ask-jaylor-cleanup-daily)
// rather than from Supabase Vault.
const RETENTION_DAYS = 30;

export const Route = createFileRoute("/api/cron/ask-jaylor-cleanup")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["INTERNAL_API_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        if (request.headers.get("X-Internal-Secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows, error } = await db
          .from("advisor_messages")
          .select("id, attachments")
          .not("attachments", "is", null)
          .lt("created_at", cutoff);
        if (error) return new Response("Could not list messages", { status: 500 });

        let messagesCleared = 0;
        let filesDeleted = 0;
        let filesFailed = 0;

        for (const row of (rows ?? []) as {
          id: string;
          attachments: { path?: string }[] | null;
        }[]) {
          const paths = (row.attachments ?? [])
            .map((a) => a.path)
            .filter((p): p is string => typeof p === "string" && p.length > 0);
          if (paths.length > 0) {
            const { data: removed, error: removeErr } = await db.storage
              .from("ask-jaylor-uploads")
              .remove(paths);
            if (removeErr) {
              filesFailed += paths.length;
              continue; // leave the reference in place, retry tomorrow
            }
            filesDeleted += removed?.length ?? paths.length;
          }
          const { error: updateErr } = await db
            .from("advisor_messages")
            .update({ attachments: null })
            .eq("id", row.id);
          if (!updateErr) messagesCleared++;
        }

        return new Response(
          JSON.stringify({
            messagesChecked: rows?.length ?? 0,
            messagesCleared,
            filesDeleted,
            filesFailed,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
