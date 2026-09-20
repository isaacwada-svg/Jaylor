import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { EventForm } from "@/components/jaylor/event-form";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";

export const Route = createFileRoute("/_authenticated/events/")({
  head: () => ({
    meta: [
      { title: "Events — Jaylor" },
      {
        name: "description",
        content:
          "Group orders for aso-ebi, weddings and other events — one link for the whole family to measure and pay their own share.",
      },
    ],
  }),
  component: Events,
});

function Events() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const canCreate = currentRole === "owner" || currentRole === "manager";
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("store_id", storeId as string)
        .order("event_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Events</h1>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              New event
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Create an aso-ebi or wedding event and share one link for the whole group to measure and pay their own share."
            action={
              canCreate ? <Button onClick={() => setFormOpen(true)}>New event</Button> : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Link
                key={event.id}
                to="/events/$eventId"
                params={{ eventId: event.id }}
                className="block rounded-2xl border border-border p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{event.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.event_date
                        ? new Date(event.event_date).toLocaleDateString()
                        : "No date set"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-gold text-gold">
                    {event.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {storeId && (
        <EventForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["events", storeId] })}
        />
      )}
    </AppShell>
  );
}
