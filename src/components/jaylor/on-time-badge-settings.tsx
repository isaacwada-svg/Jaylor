import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type OnTimeScore = {
  rate: number | null;
  orders_counted: number;
  has_enough_data: boolean;
};

/** Growth+ only -- lets the owner opt into showing their on-time score
 *  publicly on the storefront (get_storefront_on_time_badge). */
export function OnTimeBadgeSettings({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["on-time-badge-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("on_time_badge_enabled")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: score } = useQuery({
    queryKey: ["store-on-time-score", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_on_time_score", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as unknown as OnTimeScore;
    },
  });

  useEffect(() => {
    setEnabled(settings?.on_time_badge_enabled ?? false);
  }, [settings]);

  async function save(next: boolean) {
    setEnabled(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ store_id: storeId, on_time_badge_enabled: next }, { onConflict: "store_id" });
      if (error) throw error;
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["on-time-badge-settings", storeId] });
    } catch (error) {
      setEnabled(!next);
      toast.error(getErrorMessage(error, "Could not save this setting"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="font-medium">On-time delivery badge</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Show your on-time delivery score on your public storefront page.
          </p>
        </div>

        {score?.has_enough_data ? (
          <p className="text-sm text-muted-foreground">
            Preview: &ldquo;Delivered on time: {score.rate}% of the last {score.orders_counted}{" "}
            orders&rdquo;
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Needs at least 10 orders that have reached &ldquo;Ready&rdquo; in the last 90 days
            before this can turn on.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Label htmlFor="on-time-badge">Show on storefront</Label>
          <Switch
            id="on-time-badge"
            checked={enabled}
            onCheckedChange={save}
            disabled={saving || !score?.has_enough_data}
          />
        </div>
      </CardContent>
    </Card>
  );
}
