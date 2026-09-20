import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { downloadCsv } from "@/lib/csv";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy and data — Jaylor" },
      {
        name: "description",
        content: "Consent, data exports and support access for your store.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const isOwner = currentRole === "owner";
  const canExport = currentRole === "owner" || currentRole === "manager";
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);

  const { data: grants, isLoading: grantsLoading } = useQuery({
    queryKey: ["support-grants", storeId],
    enabled: !!storeId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_grants")
        .select("*")
        .eq("store_id", storeId as string)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function grantAccess(hours: 24 | 72) {
    if (!storeId) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("support_grants").insert({
        store_id: storeId,
        granted_by: userData.user?.id as string,
        expires_at: expiresAt,
      });
      if (error) throw error;
      await supabase.rpc("log_audit_event", {
        p_store_id: storeId,
        p_action: "support_access_granted",
        p_entity: "support_grants",
        p_entity_id: null as unknown as string,
        p_metadata: { hours },
      });
      toast.success(`Support access granted for ${hours} hours`);
      queryClient.invalidateQueries({ queryKey: ["support-grants", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not grant access"));
    }
  }

  async function revokeGrant(id: string) {
    try {
      const { error } = await supabase
        .from("support_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Access revoked");
      queryClient.invalidateQueries({ queryKey: ["support-grants", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not revoke access"));
    }
  }

  async function exportAllData() {
    if (!storeId) return;
    setExporting(true);
    try {
      const tables = [
        "clients",
        "measurement_sets",
        "orders",
        "payments",
        "consultations",
        "events",
        "expenses",
      ] as const;

      for (const table of tables) {
        const { data, error } = await supabase.from(table).select("*").eq("store_id", storeId);
        if (error) throw error;
        if (!data || data.length === 0) continue;
        const headers = Object.keys(data[0] as Record<string, unknown>);
        const rows = [
          headers,
          ...data.map((row) =>
            headers.map((h) => ((row as Record<string, unknown>)[h] as string | number) ?? ""),
          ),
        ];
        downloadCsv(`jaylor-${table}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        // stagger downloads slightly so the browser doesn't block multiple auto-downloads
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      toast.success("Export complete — check your downloads");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not export your data"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">Privacy and data</h1>
        <StitchDivider className="my-6" />

        {isOwner && (
          <>
            <h2 className="text-xl">Support access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant Bethjay support temporary, time-limited access to help with an issue. It expires
              automatically and never includes payment details.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => grantAccess(24)}>
                Grant for 24 hours
              </Button>
              <Button size="sm" variant="outline" onClick={() => grantAccess(72)}>
                Grant for 72 hours
              </Button>
            </div>

            {grantsLoading ? (
              <Skeleton className="mt-4 h-16 rounded-xl" />
            ) : grants && grants.length > 0 ? (
              <div className="mt-4 space-y-2">
                {grants.map((grant) => (
                  <div
                    key={grant.id}
                    className="flex items-center justify-between rounded-xl border border-gold/40 bg-accent/30 p-3 text-sm"
                  >
                    <span>Active until {new Date(grant.expires_at).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => revokeGrant(grant.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No active support access.</p>
            )}
            <StitchDivider className="my-8" />
          </>
        )}

        {canExport && (
          <>
            <h2 className="text-xl">Export your data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Download all your clients, measurements, orders, payments, consultations, events and
              expenses as CSV files.
            </p>
            <Card className="mt-3 rounded-2xl">
              <CardContent className="p-4">
                <Button onClick={exportAllData} disabled={exporting}>
                  {exporting ? "Preparing export..." : "Export all data"}
                </Button>
              </CardContent>
            </Card>
            <StitchDivider className="my-8" />
          </>
        )}

        <h2 className="text-xl">A client&apos;s data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          To permanently delete a single client&apos;s record, open their profile from the Clients
          page and use Delete client there.
        </p>

        {isOwner && (
          <>
            <StitchDivider className="my-8" />
            <h2 className="text-xl">Close your store</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Closing a store is permanent and needs a short verification step. Message us on
              WhatsApp or email to start the process — nothing is deleted without your confirmation.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
