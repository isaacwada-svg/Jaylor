import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, MessageCircle, Plus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useStore } from "@/lib/store-context";
import { formatMoney } from "@/lib/jaylor";
import { normalizePhoneNG, formatPhoneNG } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  head: () => ({
    meta: [{ title: "Event — Jaylor" }],
  }),
  component: EventDetail,
});

type ParticipantRow = Tables<"event_participants">;

const STATUSES: { value: string; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "measured", label: "Measured" },
  { value: "paid_deposit", label: "Paid deposit" },
  { value: "paid_full", label: "Paid full" },
  { value: "in_production", label: "In production" },
  { value: "ready", label: "Ready" },
  { value: "collected", label: "Collected" },
];

function EventDetail() {
  const { eventId } = Route.useParams();
  const { currentRole } = useStore();
  const canManage = currentRole === "owner" || currentRole === "manager";
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [payingParticipant, setPayingParticipant] = useState<ParticipantRow | null>(null);
  const [paidAmountDraft, setPaidAmountDraft] = useState("");

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ["event-participants", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const styles = useMemo(
    () => (Array.isArray(event?.styles) ? (event.styles as { key: string; label: string }[]) : []),
    [event],
  );
  const styleLabel = (key: string | null) =>
    (key && styles.find((s) => s.key === key)?.label) || "Not chosen";

  const counts = useMemo(() => {
    const base: Record<string, number> = {};
    for (const s of STATUSES) base[s.value] = 0;
    for (const p of participants ?? []) {
      base[p.status] = (base[p.status] ?? 0) + 1;
    }
    return base;
  }, [participants]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] });
  }

  async function handleAddParticipant(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event) return;
    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) {
      toast.error("Enter a valid Nigerian phone number");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("event_participants").insert({
        event_id: event.id,
        store_id: event.store_id,
        full_name: name.trim(),
        phone,
      });
      if (error) throw error;
      toast.success("Guest added");
      setName("");
      setPhoneRaw("");
      setAddOpen(false);
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this guest"));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(participant: ParticipantRow, status: string) {
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ status })
        .eq("id", participant.id);
      if (error) throw error;
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update status"));
    }
  }

  function guestLink(participant: ParticipantRow) {
    return `${window.location.origin}/e/${participant.token}`;
  }

  function copyLink(participant: ParticipantRow) {
    navigator.clipboard
      .writeText(guestLink(participant))
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy link"));
  }

  function openPaymentDialog(participant: ParticipantRow) {
    setPayingParticipant(participant);
    setPaidAmountDraft(String(participant.paid_amount));
  }

  async function savePaidAmount() {
    if (!payingParticipant) return;
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ paid_amount: Number(paidAmountDraft) || 0 })
        .eq("id", payingParticipant.id);
      if (error) throw error;
      toast.success("Payment recorded");
      setPayingParticipant(null);
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not record this payment"));
    }
  }

  if (eventLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
          <EmptyState
            title="Event not found"
            description="This event may have been removed, or belongs to a different store."
            action={
              <Button asChild>
                <Link to="/events">Back to events</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Events
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">{event.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {event.event_date ? new Date(event.event_date).toLocaleDateString() : "No date set"}
              {event.fabric_description ? ` · ${event.fabric_description}` : ""}
            </p>
          </div>
          <Badge variant="outline" className="border-gold text-gold">
            {event.status}
          </Badge>
        </div>

        <StitchDivider className="my-6" />

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {STATUSES.map((s) => (
            <div key={s.value} className="rounded-xl border border-border p-3 text-center">
              <p className="figures text-xl">{counts[s.value] ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="text-xl">Guests</h2>
          {canManage && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add guest
            </Button>
          )}
        </div>

        {participantsLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !participants || participants.length === 0 ? (
          <EmptyState
            className="mt-6"
            title="No guests yet"
            description="Add guests one by one and share their personal link so they can pick a style and pay their own share."
            action={
              canManage ? <Button onClick={() => setAddOpen(true)}>Add guest</Button> : undefined
            }
          />
        ) : (
          <div className="mt-4 space-y-3">
            {participants.map((participant) => (
              <div key={participant.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{participant.full_name}</p>
                    <p className="figures text-sm text-muted-foreground">
                      {formatPhoneNG(participant.phone)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {styleLabel(participant.style_key)}
                    </p>
                  </div>
                  <div className="text-right">
                    <MoneyText paid={participant.paid_amount} />
                  </div>
                </div>
                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={participant.status}
                      onValueChange={(v) => updateStatus(participant, v)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPaymentDialog(participant)}
                    >
                      Record payment
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyLink(participant)}>
                      <Copy className="size-4" />
                      Copy link
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={whatsappLink(
                          participant.phone,
                          `Hi ${participant.full_name.split(" ")[0]}, here's your link for ${event.name}: ${guestLink(participant)}`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4" />
                        Remind
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a guest</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddParticipant} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="guest-name">Name</Label>
              <Input
                id="guest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Phone</Label>
              <Input
                id="guest-phone"
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder="0803 123 4567"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Adding..." : "Add guest"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!payingParticipant}
        onOpenChange={(open) => !open && setPayingParticipant(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment for {payingParticipant?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paid-amount">Total paid so far</Label>
            <MoneyInput id="paid-amount" value={paidAmountDraft} onChange={setPaidAmountDraft} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingParticipant(null)}>
              Cancel
            </Button>
            <Button onClick={savePaidAmount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function MoneyText({ paid }: { paid: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Paid</p>
      <p className="figures font-medium text-paid">{formatMoney(paid)}</p>
    </div>
  );
}
