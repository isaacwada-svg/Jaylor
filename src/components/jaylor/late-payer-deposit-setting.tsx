import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The deposit percent suggested for clients whose payment reliability is "Often needs reminders". */
export function LatePayerDepositSetting({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");

  const { data: current } = useQuery({
    queryKey: ["late-payer-deposit-percent", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("late_payer_deposit_percent")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data?.late_payer_deposit_percent ?? 70;
    },
  });

  async function save() {
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.error("Enter a percent between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("store_settings")
        .update({ late_payer_deposit_percent: value })
        .eq("store_id", storeId);
      if (error) throw error;
      toast.success("Saved");
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["late-payer-deposit-percent", storeId] });
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
          <p className="font-medium">Deposit suggestion for slow payers</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When a client's payment reliability is "Often needs reminders", the new order screen
            suggests this deposit percentage.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="late-payer-deposit">Deposit percent</Label>
            <Input
              id="late-payer-deposit"
              inputMode="numeric"
              placeholder={String(current ?? 70)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button onClick={save} disabled={saving || !input.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
