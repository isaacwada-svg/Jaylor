import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PassportShareInbox({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();

  const { data: shares } = useQuery({
    queryKey: ["passport-shares", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_passport_shares")
        .select("id, full_name, created_at")
        .eq("target_store_id", storeId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function accept(shareId: string) {
    try {
      await supabase.rpc("accept_passport_share", { p_share_id: shareId });
      toast.success("Client added with their measurements");
      queryClient.invalidateQueries({ queryKey: ["passport-shares", storeId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not accept this request"));
    }
  }

  async function decline(shareId: string) {
    try {
      await supabase.rpc("decline_passport_share", { p_share_id: shareId });
      queryClient.invalidateQueries({ queryKey: ["passport-shares", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not decline this request"));
    }
  }

  if (!shares || shares.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-center gap-2">
        <QrCode className="size-4 text-gold" />
        <p className="font-medium">
          {shares.length} measurement card{shares.length === 1 ? "" : "s"} shared with you
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {shares.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div>
              <p className="text-sm font-medium">{s.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => decline(s.id)}>
                Decline
              </Button>
              <Button size="sm" onClick={() => accept(s.id)}>
                Add client
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
