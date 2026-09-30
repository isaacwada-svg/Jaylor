import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useCapacityForecast } from "@/lib/use-capacity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Growth+ only -- the manual fallback used until 4 weeks of real
 *  throughput exist (get_store_capacity_forecast / get_order_capacity_check
 *  fall back to this automatically once it's set). */
export function CapacityEstimateSettings({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [estimate, setEstimate] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["capacity-estimate-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("weekly_capacity_estimate")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: forecast } = useCapacityForecast(storeId, 1);

  useEffect(() => {
    setEstimate(settings?.weekly_capacity_estimate?.toString() ?? "");
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const value = estimate.trim() ? Number(estimate) : null;
      const { error } = await supabase
        .from("store_settings")
        .upsert({ store_id: storeId, weekly_capacity_estimate: value }, { onConflict: "store_id" });
      if (error) throw error;
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["capacity-estimate-settings", storeId] });
      queryClient.invalidateQueries({ queryKey: ["store-capacity-forecast", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this setting"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="font-medium">Weekly capacity estimate</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Roughly how many garments your shop can finish in a week. Used for the delivery-date
            warning and the dashboard load chart until we have 4 weeks of your own history to
            measure it automatically.
          </p>
        </div>

        {forecast?.capacity_source === "measured" && (
          <p className="text-xs text-muted-foreground">
            We&apos;re already measuring this from your own orders (about {forecast.capacity}
            /week) — this estimate only takes over if that history is ever too thin.
          </p>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="capacity-estimate">Garments per week</Label>
            <Input
              id="capacity-estimate"
              type="number"
              min={1}
              inputMode="numeric"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="e.g. 20"
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
