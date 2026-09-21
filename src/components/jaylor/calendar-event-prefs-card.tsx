import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type EventDef = { key: string; label: string; default_enabled: boolean; sort_order: number };
type EventPref = { event_key: string; enabled: boolean };

/**
 * The fashion-calendar tables and RPC are not part of the generated database
 * types yet, so this narrow, untyped view of the client keeps the calls
 * compiling without loosening types anywhere else.
 */
const calendarDb = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string) => Promise<{ data: unknown; error: unknown }>;
      eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

export function CalendarEventPrefsCard({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();

  const { data: defs, isLoading: defsLoading } = useQuery({
    queryKey: ["calendar-event-defs"],
    queryFn: async () => {
      const { data, error } = await calendarDb
        .from("calendar_event_defs")
        .select("key, label, default_enabled, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as EventDef[];
    },
  });

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ["calendar-event-prefs", storeId],
    queryFn: async () => {
      const { data, error } = await calendarDb
        .from("store_calendar_events")
        .select("event_key, enabled")
        .eq("store_id", storeId);
      if (error) throw error;
      return (data ?? []) as EventPref[];
    },
  });

  async function toggle(eventKey: string, next: boolean) {
    try {
      const { error } = await calendarDb.rpc("set_store_calendar_event_enabled", {
        p_store_id: storeId,
        p_key: eventKey,
        p_enabled: next,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["calendar-event-prefs", storeId] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-calendar-events", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save this setting"));
    }
  }

  if (defsLoading || prefsLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!defs || defs.length === 0) return null;

  const enabledFor = (key: string, defaultEnabled: boolean) =>
    prefs?.find((p) => p.event_key === key)?.enabled ?? defaultEnabled;

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="font-medium">Season alerts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which events show up on your dashboard 8 weeks ahead.
          </p>
        </div>
        <div className="space-y-2">
          {defs.map((d) => (
            <label
              key={d.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <span className="text-sm">{d.label}</span>
              <Switch
                checked={enabledFor(d.key, d.default_enabled)}
                onCheckedChange={(next) => toggle(d.key, next)}
              />
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
