import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seasonAlertMessage, whatsappLink } from "@/lib/whatsapp";
import { useStore } from "@/lib/store-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UpcomingEvent = {
  event_key: string;
  label: string;
  event_date: string;
  event_end_date: string | null;
  days_away: number;
  lead_weeks_message: string | null;
  last_year_order_count: number;
  last_year_top_garment_types: string | null;
};

/**
 * Season/calendar alerts, rule-based (no AI): the fashion calendar and this
 * store's own order history are entirely computed and queried server-side
 * (upcoming_calendar_events RPC) — see calendar_event_defs/overrides tables.
 */
export function ComingUpCard({ storeId }: { storeId: string | undefined }) {
  const { currentStore } = useStore();
  const { data: events, isLoading } = useQuery({
    queryKey: ["upcoming-calendar-events", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      // Not in the generated database types yet, so call through an untyped view.
      const calendarRpc = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };
      const { data, error } = await calendarRpc.rpc("upcoming_calendar_events", {
        p_store_id: storeId as string,
        p_weeks_ahead: 8,
      });
      if (error) throw error;
      return data as unknown as UpcomingEvent[];
    },
  });

  if (isLoading || !events || events.length === 0) return null;

  return (
    <Card className="rounded-2xl border-gold/30">
      <CardContent className="space-y-3 p-5">
        <p className="font-medium">Coming up</p>
        {events.map((e) => {
          const suggestion =
            e.last_year_order_count > 0
              ? `Last year you took ${e.last_year_order_count} order${e.last_year_order_count === 1 ? "" : "s"} in the 4 weeks before${
                  e.last_year_top_garment_types ? `, mostly ${e.last_year_top_garment_types}` : ""
                }.`
              : e.lead_weeks_message;
          const reminderPhone = currentStore?.whatsapp_phone;
          return (
            <div key={e.event_key} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{e.label}</p>
                <p className="text-xs text-muted-foreground">
                  {e.days_away <= 0
                    ? "This week"
                    : `In ${e.days_away} day${e.days_away === 1 ? "" : "s"}`}
                </p>
              </div>
              {suggestion && <p className="mt-1 text-sm text-muted-foreground">{suggestion}</p>}
              {reminderPhone && (
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <a
                    href={whatsappLink(
                      reminderPhone,
                      seasonAlertMessage(e.label, Math.round(e.days_away / 7), suggestion ?? null),
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" />
                    Remind me on WhatsApp
                  </a>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
