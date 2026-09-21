import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function StoreLocationSettings({
  storeId,
  city,
  state,
  area,
  consentBenchmarkSharing,
}: {
  storeId: string;
  city: string | null;
  state: string | null;
  area: string | null;
  consentBenchmarkSharing: boolean;
}) {
  const queryClient = useQueryClient();
  const [cityInput, setCityInput] = useState(city ?? "");
  const [stateInput, setStateInput] = useState(state ?? "");
  const [areaInput, setAreaInput] = useState(area ?? "");
  const [consent, setConsent] = useState(consentBenchmarkSharing);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          city: cityInput.trim() || null,
          state: stateInput.trim() || null,
          area: areaInput.trim() || null,
        })
        .eq("id", storeId);
      if (error) throw error;
      toast.success("Location updated");
      queryClient.invalidateQueries({ queryKey: ["store-memberships"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your location"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleConsent(next: boolean) {
    setConsent(next);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          consent_benchmark_sharing: next,
          consent_benchmark_sharing_at: new Date().toISOString(),
        })
        .eq("id", storeId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["store-memberships"] });
    } catch (error) {
      setConsent(!next);
      toast.error(getErrorMessage(error, "Could not save this setting"));
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-medium">Location</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Used to show you what similar shops in your area charge, once enough shops share.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="store-city">City</Label>
            <Input
              id="store-city"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-state">State</Label>
            <Input
              id="store-state"
              value={stateInput}
              onChange={(e) => setStateInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-area">Area</Label>
            <Input
              id="store-area"
              value={areaInput}
              onChange={(e) => setAreaInput(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save location"}
        </Button>

        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">Contribute anonymous pricing data</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Shares only garment type, city and price with Jaylor's city price benchmarks — never
              your identity or any client's. Shops that share are the only ones who can see what
              similar shops in their city charge.
            </p>
          </div>
          <Switch checked={consent} onCheckedChange={toggleConsent} />
        </div>
      </CardContent>
    </Card>
  );
}
