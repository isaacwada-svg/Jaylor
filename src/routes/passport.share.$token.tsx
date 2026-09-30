import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/jaylor/logo";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPANY_LINE } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/passport/share/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [{ title: "Import a Passport — Jaylor" }],
  }),
  component: PassportSharePage,
});

type Membership = { store_id: string; store_name: string };

function PassportSharePage() {
  const { token } = Route.useParams();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [storeId, setStoreId] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: memberships } = useQuery({
    queryKey: ["passport-share-memberships", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("store_members")
        .select("store_id, stores(name)")
        .eq("user_id", userId as string);
      if (error) throw error;
      return (data ?? [])
        .filter((row): row is { store_id: string; stores: { name: string } } => !!row.stores)
        .map((row) => ({ store_id: row.store_id, store_name: row.stores.name }));
    },
  });

  useEffect(() => {
    if (memberships && memberships.length > 0 && !storeId) {
      setStoreId(memberships[0]!.store_id);
    }
  }, [memberships, storeId]);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["passport-share-preview", token, storeId],
    enabled: !!storeId && online,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_passport_share_preview", {
        p_share_token: token,
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as {
        status: "not_found" | "revoked" | "empty" | "available";
        full_name?: string;
        values?: Record<string, number>;
        extra_fields?: Record<string, number | string>;
        unit?: string;
        taken_at?: string;
      };
    },
  });

  async function handleImport() {
    if (!storeId) return;
    setImporting(true);
    try {
      const { error } = await supabase.rpc("import_passport_share", {
        p_share_token: token,
        p_store_id: storeId,
      });
      if (error) throw error;
      toast.success("Measurements imported");
      setImported(true);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not import these measurements"));
    } finally {
      setImporting(false);
    }
  }

  if (!online) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">
          <OfflineNotice label="Connect to the internet to import this Passport." />
        </div>
      </main>
    );
  }

  if (userId === undefined) {
    return (
      <main className="linen min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (userId === null) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-center">
        <Link to="/" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>
        <h1 className="mt-8 text-xl">Sign in to import this Passport</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A client shared their measurements with your shop. Sign in (or join Jaylor) to bring them
          into your client list.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild variant="outline">
            <Link to="/auth">Log in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth" search={{ mode: "signup", passport_share: token }}>
              Sign up your shop
            </Link>
          </Button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </main>
    );
  }

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          {memberships && memberships.length > 1 && (
            <div className="mb-4 space-y-2">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a shop" />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => (
                    <SelectItem key={m.store_id} value={m.store_id}>
                      {m.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading || !preview ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : preview.status === "not_found" ? (
            <div className="text-center">
              <h1 className="text-xl">We couldn&apos;t find this link</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask the client to send you their share link again.
              </p>
            </div>
          ) : preview.status === "revoked" ? (
            <div className="text-center">
              <h1 className="text-xl">This share link was turned off</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The client has revoked access through this link.
              </p>
            </div>
          ) : preview.status === "empty" ? (
            <div className="text-center">
              <h1 className="text-xl">No measurements to import yet</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This client hasn&apos;t been measured by a Jaylor tailor yet.
              </p>
            </div>
          ) : imported ? (
            <div className="text-center">
              <h1 className="text-xl">Imported</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.full_name}&apos;s measurements are now in your client list.
              </p>
              <Button asChild className="mt-4">
                <Link to="/clients">Go to clients</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl">Import {preview.full_name}&apos;s measurements</h1>
              {preview.taken_at && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Taken {new Date(preview.taken_at).toLocaleDateString()}
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(preview.values ?? {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
                    <span className="figures">
                      {value}
                      {preview.unit}
                    </span>
                  </div>
                ))}
                {Object.entries(preview.extra_fields ?? {}).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="figures">{value}</span>
                  </div>
                ))}
              </div>
              <Button className="mt-6 w-full" disabled={importing} onClick={handleImport}>
                <Download className="size-4" />
                {importing ? "Importing..." : "Import into my client list"}
              </Button>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
