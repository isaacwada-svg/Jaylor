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
import { jobTemplate } from "@/lib/job-templates";

export const Route = createFileRoute("/_authenticated/events/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Group orders — Jaylor" },
      {
        name: "description",
        content:
          "One link that collects measurements and money from a whole group — aso-ebi, burials, uniforms, or anyone who can't come in.",
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
          <h1 className="text-3xl">Group orders</h1>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              New group order
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
            title="No group orders yet"
            description="Aso-ebi, burial, uniforms, or one client who can't come in — share one link and let them measure and pay their own share."
            action={
              canCreate ? (
                <Button onClick={() => setFormOpen(true)}>New group order</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const dueForRepeat =
                !!event.repeat_reminder_date && new Date(event.repeat_reminder_date) <= new Date();
              return (
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
                        {jobTemplate(event.job_type).label}
                        {" · "}
                        {event.event_date
                          ? new Date(event.event_date).toLocaleDateString()
                          : "No date set"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="border-gold text-gold">
                        {event.status}
                      </Badge>
                      {dueForRepeat && (
                        <Badge variant="outline" className="border-paid/40 text-paid">
                          Time to repeat
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
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
