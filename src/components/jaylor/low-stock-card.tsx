import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/lib/use-feature";
import { formatQuantity } from "@/lib/inventory";
import { Card, CardContent } from "@/components/ui/card";

/** Business+ dashboard card. Hidden entirely below Business plan, or when
 *  nothing is running low -- reads the tailor-safe view since it never
 *  needs cost_per_unit. */
export function LowStockCard({ storeId }: { storeId: string }) {
  const { data: feature } = useFeature(storeId, "inventory");

  const { data: items } = useQuery({
    queryKey: ["low-stock-items", storeId],
    enabled: !!feature?.allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items_for_tailor")
        .select("id, name, quantity, unit, reorder_level, is_active")
        .eq("store_id", storeId)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter(
        (i) => (i.reorder_level ?? 0) > 0 && (i.quantity ?? 0) <= (i.reorder_level ?? 0),
      );
    },
  });

  if (!feature?.allowed || !items || items.length === 0) return null;

  return (
    <Card className="mb-6 rounded-2xl border-owed/40">
      <CardContent className="p-5">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-owed">
          <AlertTriangle className="size-3.5" />
          Running low
        </p>
        <div className="mt-2 space-y-1">
          {items.map((item) => (
            <p key={item.id ?? item.name} className="text-sm">
              {item.name ?? "Item"} —{" "}
              <span className="figures">{formatQuantity(item.quantity ?? 0, item.unit ?? "")}</span>{" "}
              left
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
