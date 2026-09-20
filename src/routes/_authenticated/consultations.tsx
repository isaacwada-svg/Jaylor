import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { ConsultationForm } from "@/components/jaylor/consultation-form";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useStore } from "@/lib/store-context";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/consultations")({
  head: () => ({
    meta: [
      { title: "Consultations — Jaylor" },
      {
        name: "description",
        content:
          "Book measurement, fitting and style consultations, and confirm booking requests from your storefront.",
      },
      { property: "og:title", content: "Consultations — Jaylor" },
      {
        property: "og:description",
        content: "Confirm booking requests and keep every consultation on one calm calendar.",
      },
    ],
  }),
  component: Consultations,
});

type ConsultationRequest = Tables<"consultation_requests">;

const TYPE_LABELS: Record<string, string> = {
  measurement: "Measurement",
  fitting: "Fitting",
  style: "Style",
  video: "Video",
};

function Consultations() {
  const { currentStore, currentRole } = useStore();
  const storeId = currentStore?.id;
  const queryClient = useQueryClient();
  const canCreate = currentRole === "owner" || currentRole === "manager";
  const [formOpen, setFormOpen] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const { data: consultations, isLoading: loadingConsultations } = useQuery({
    queryKey: ["consultations", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("*")
        .eq("store_id", storeId as string)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["consultation-requests", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultation_requests")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("status", "pending")
        .order("preferred_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const clientIds = useMemo(
    () => [
      ...new Set((consultations ?? []).map((c) => c.client_id).filter((id): id is string => !!id)),
    ],
    [consultations],
  );
  const { data: clients } = useQuery({
    queryKey: ["consultations-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      if (error) throw error;
      return data;
    },
  });
  const clientName = (id: string | null) =>
    (id && clients?.find((c) => c.id === id)?.full_name) || "Walk-in";

  const now = new Date();
  const upcoming = (consultations ?? []).filter((c) => new Date(c.ends_at) >= now);
  const past = (consultations ?? []).filter((c) => new Date(c.ends_at) < now);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["consultations", storeId] });
    queryClient.invalidateQueries({ queryKey: ["consultation-requests", storeId] });
  }

  async function handleConfirm(request: ConsultationRequest) {
    if (!storeId) return;
    setActingOn(request.id);
    try {
      const { data: existing, error: findError } = await supabase
        .from("clients")
        .select("id")
        .eq("store_id", storeId)
        .eq("phone", request.phone)
        .maybeSingle();
      if (findError) throw findError;

      let clientId = existing?.id;
      if (!clientId) {
        const { data: created, error: createError } = await supabase
          .from("clients")
          .insert({
            store_id: storeId,
            full_name: request.name,
            phone: request.phone,
            consent_whatsapp: request.consent_whatsapp,
          })
          .select("id")
          .single();
        if (createError) throw createError;
        clientId = created.id;
      }

      const start = new Date(request.preferred_at);
      const end = new Date(start.getTime() + 30 * 60_000);
      const { data: consultation, error: bookError } = await supabase
        .from("consultations")
        .insert({
          store_id: storeId,
          client_id: clientId,
          type: request.type,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          notes: request.note,
          source: "public",
        })
        .select("id")
        .single();
      if (bookError) throw bookError;

      const { error: updateError } = await supabase
        .from("consultation_requests")
        .update({ status: "confirmed", consultation_id: consultation.id })
        .eq("id", request.id);
      if (updateError) throw updateError;

      toast.success("Consultation confirmed");
      invalidateAll();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not confirm this request"));
    } finally {
      setActingOn(null);
    }
  }

  async function handleDecline(requestId: string) {
    setActingOn(requestId);
    try {
      const { error } = await supabase
        .from("consultation_requests")
        .update({ status: "declined" })
        .eq("id", requestId);
      if (error) throw error;
      toast("Request declined");
      invalidateAll();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not decline this request"));
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Consultations</h1>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              New
            </Button>
          )}
        </div>
        <StitchDivider className="my-6" />

        {requests && requests.length > 0 && (
          <>
            <h2 className="text-xl">Booking requests</h2>
            <div className="mt-3 space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-gold/40 bg-accent/30 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{request.name}</p>
                    <p className="figures text-sm text-muted-foreground">
                      {formatPhoneNG(request.phone)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {TYPE_LABELS[request.type] ?? request.type} ·{" "}
                      {new Date(request.preferred_at).toLocaleString()}
                    </p>
                    {request.note && (
                      <p className="mt-2 text-sm text-muted-foreground">{request.note}</p>
                    )}
                  </div>
                  {canCreate && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={actingOn === request.id}
                        onClick={() => handleConfirm(request)}
                      >
                        <Check className="size-4" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingOn === request.id}
                        onClick={() => handleDecline(request.id)}
                      >
                        <X className="size-4" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <StitchDivider className="my-6" />
          </>
        )}

        <h2 className="text-xl">Upcoming</h2>
        {loadingConsultations ? (
          <div className="mt-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <EmptyState
            className="mt-6"
            title="No consultations booked"
            description="Book a measurement, fitting or style consultation, or share your booking link with clients."
            action={
              canCreate ? (
                <Button onClick={() => setFormOpen(true)}>New consultation</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-3 space-y-3">
            {upcoming.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{clientName(c.client_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {TYPE_LABELS[c.type] ?? c.type} · {new Date(c.starts_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-gold text-gold">
                    {c.status}
                  </Badge>
                </div>
                {c.meeting_link && (
                  <a
                    href={c.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-gold underline"
                  >
                    Meeting link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mt-8 text-xl">Past</h2>
            <div className="mt-3 space-y-2">
              {past.slice(0, 10).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                >
                  <span>{clientName(c.client_id)}</span>
                  <span className="text-muted-foreground">
                    {TYPE_LABELS[c.type] ?? c.type} · {new Date(c.starts_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {storeId && (
        <ConsultationForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["consultations", storeId] })}
        />
      )}
    </AppShell>
  );
}
