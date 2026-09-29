import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Occasion = { key: string; label: string; days_away: number; client_ids: string[] };

/** Free festive detection: shows the nearest occasion (within 30 days) that has past clients. */
export function FestiveCard({ storeId }: { storeId: string | undefined }) {
  const { data } = useQuery({
    queryKey: ["festive-upcoming", storeId, 30],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("festive_upcoming", { p_store_id: storeId, p_days: 30 });
      if (error) throw error;
      return ((data ?? []) as Occasion[]).filter((o) => o.client_ids.length > 0).sort((a, b) => a.days_away - b.days_away);
    },
  });
  const o = data?.[0];
  if (!o) return null;
  const n = o.client_ids.length;
  return (
    <section className="border border-gold/50 bg-card p-5">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-gold">
        <CalendarHeart className="size-4" /> Festive season
      </p>
      <p className="mt-2 text-lg">
        {o.label} is in {o.days_away} day{o.days_away === 1 ? "" : "s"}. {n} client{n === 1 ? "" : "s"} sewed with you last {o.label}. Send them a message?
      </p>
      <Button asChild className="mt-3 h-12">
        <Link to="/festive" search={{ occasion: o.key }}>See clients</Link>
      </Button>
    </section>
  );
}
