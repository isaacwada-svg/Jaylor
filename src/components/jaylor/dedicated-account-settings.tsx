import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/lib/jaylor";

export function DedicatedAccountSettings({ storeId, tier }: { storeId: string; tier: Tier }) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  const {
    data: account,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["dedicated-account", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dedicated_accounts")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (tier === "Free" || isLoading) return null;

  async function request() {
    try {
      const { data, error } = await supabase.functions.invoke("create-dedicated-account", {
        body: { storeId },
      });
      if (error) throw error;
      const result = data as { result: { status: string } };
      toast.success(
        result.result.status === "active"
          ? "Your business account number is ready"
          : "Requested — this usually takes a moment",
      );
      queryClient.invalidateQueries({ queryKey: ["dedicated-account", storeId] });
    } catch (error) {
      toast.error(await getFunctionErrorMessage(error, "Could not request an account number"));
    }
  }

  function copyNumber() {
    if (!account?.account_number) return;
    navigator.clipboard
      .writeText(account.account_number)
      .then(() => toast.success("Account number copied"))
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium">Business account number</p>
          {account?.status === "active" ? (
            <Badge className="border-paid/40 bg-paid/10 text-paid">Active</Badge>
          ) : account?.status === "pending" ? (
            <Badge variant="outline">Pending</Badge>
          ) : account?.status === "failed" ? (
            <Badge variant="destructive">Failed</Badge>
          ) : (
            <Badge variant="outline">Not requested</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A dedicated bank account number just for your shop. Clients can pay by plain transfer, and
          Jaylor matches transfers to their order automatically. Money still settles to your own
          bank, same fee as Jaylor Pay.
        </p>

        {account?.status === "active" && account.account_number && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <p className="figures font-medium">{account.account_number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {account.account_name} · {account.bank_name}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={copyNumber}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        )}

        {account?.status === "failed" && account.failure_reason && (
          <p className="mt-3 text-sm text-destructive">{account.failure_reason}</p>
        )}

        {account?.status === "pending" ? (
          <Button
            className="mt-3 w-full"
            variant="outline"
            onClick={() => refetch()}
            disabled={!online}
          >
            {online ? "Check again" : "Needs connection"}
          </Button>
        ) : account?.status !== "active" ? (
          <Button className="mt-3 w-full" onClick={request} disabled={!online}>
            {!online
              ? "Needs connection"
              : account?.status === "failed"
                ? "Try again"
                : "Get my business account number"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
