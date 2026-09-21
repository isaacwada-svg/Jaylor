import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GarmentType = { code: string; name: string; category: string };
type UnmappedRow = { garment_type: string; order_count: number };

/**
 * P0's garment taxonomy mapping screen: lets the shop owner map their own
 * historical free-text garment names (typos, variations like "big agbada")
 * onto Jaylor's fixed garment_types list, so past orders join the same
 * taxonomy new orders record automatically.
 */
export function GarmentTypeMappingCard({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: garmentTypes } = useQuery({
    queryKey: ["garment-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("garment_types")
        .select("code, name, category")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as GarmentType[];
    },
  });

  const { data: unmapped, isLoading } = useQuery({
    queryKey: ["unmapped-garment-types", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unmapped_garment_type_names", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as UnmappedRow[];
    },
  });

  async function saveMapping(aliasText: string) {
    const code = choices[aliasText];
    if (!code) {
      toast.error("Pick a garment type first");
      return;
    }
    setSaving(aliasText);
    try {
      const { error } = await supabase.rpc("resolve_garment_type_mapping", {
        p_store_id: storeId,
        p_alias_text: aliasText,
        p_garment_type_code: code,
      });
      if (error) throw error;
      toast.success(`Mapped "${aliasText}"`);
      queryClient.invalidateQueries({ queryKey: ["unmapped-garment-types", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this mapping"));
    } finally {
      setSaving(null);
    }
  }

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if (!unmapped || unmapped.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-medium">Match your old garment names</p>
          <p className="mt-1 text-sm text-muted-foreground">
            These past orders used garment names outside Jaylor's fixed list. Map each one so your
            reports and forecasts group them correctly — this doesn't change the order itself.
          </p>
        </div>
        <div className="space-y-3">
          {unmapped.map((row) => (
            <div
              key={row.garment_type}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{row.garment_type}</p>
                <p className="text-xs text-muted-foreground">
                  {row.order_count} order{row.order_count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={choices[row.garment_type] ?? ""}
                  onValueChange={(value) =>
                    setChoices((c) => ({ ...c, [row.garment_type]: value }))
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Choose type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(garmentTypes ?? []).map((g) => (
                      <SelectItem key={g.code} value={g.code}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving === row.garment_type || !choices[row.garment_type]}
                  onClick={() => saveMapping(row.garment_type)}
                >
                  {saving === row.garment_type ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
