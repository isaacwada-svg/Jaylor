import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { effectiveTier, formatMoney, jaylorPayFeePercent } from "@/lib/jaylor";
import { normalizePhoneNG, formatPhoneNG } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";
import { jobTemplate } from "@/lib/job-templates";
import { QuoteDocument, type QuoteData } from "@/components/jaylor/quote-document";
import { MeasuringDayPanel } from "@/components/jaylor/measuring-day-panel";
import { JobBatchesPanel } from "@/components/jaylor/job-batches-panel";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  staticData: { sitemap: false },
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
  const navigate = useNavigate();
  const { currentStore, currentRole } = useStore();
  const canManage = currentRole === "owner" || currentRole === "manager";
  const tier = effectiveTier(currentStore);
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [reminderMonths, setReminderMonths] = useState("12");
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
    () =>
      Array.isArray(event?.styles)
        ? (event.styles as { key: string; label: string; price: number | null }[])
        : [],
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

  const priceTiers = useMemo(
    () =>
      Array.isArray(event?.price_tiers)
        ? (event.price_tiers as { minQty: number; maxQty: number | null; price: number }[])
        : [],
    [event],
  );
  const tierPrice = useMemo(() => {
    if (event?.pricing_mode !== "quantity_tiers" || priceTiers.length === 0) return null;
    const count = (participants ?? []).length;
    const tier = [...priceTiers]
      .sort((a, b) => a.minQty - b.minQty)
      .find((t) => count >= t.minQty && (t.maxQty == null || count <= t.maxQty));
    return tier?.price ?? null;
  }, [event, priceTiers, participants]);

  function amountDueFor(participant: ParticipantRow) {
    const style = styles.find((s) => s.key === participant.style_key);
    return style?.price ?? tierPrice ?? event?.price_per_person ?? 0;
  }

  const moneySummary = useMemo(() => {
    const rows = participants ?? [];
    const expected = rows.reduce((sum, p) => sum + amountDueFor(p), 0);
    const collected = rows.reduce((sum, p) => sum + p.paid_amount, 0);
    const outstanding = Math.max(0, expected - collected);
    const feePercent = jaylorPayFeePercent(tier);
    const fee = Math.round(collected * (feePercent / 100));
    return { expected, collected, outstanding, fee, feePercent };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, styles, tierPrice, event, tier]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] });
  }

  async function duplicateJob() {
    if (!event) return;
    setDuplicating(true);
    try {
      const { data: newEvent, error } = await supabase
        .from("events")
        .insert({
          store_id: event.store_id,
          name: `${event.name} (repeat)`,
          job_type: event.job_type,
          payer_mode: event.payer_mode,
          collection_mode: "none",
          pricing_mode: event.pricing_mode,
          turnaround_mode: event.turnaround_mode,
          organiser_name: event.organiser_name,
          organiser_phone: event.organiser_phone,
          fabric_description: event.fabric_description,
          styles: event.styles,
          size_chart: event.size_chart,
          price_tiers: event.price_tiers,
          price_per_person: event.price_per_person,
          deposit_amount: event.deposit_amount,
          delivery_country: event.delivery_country,
          delivery_address: event.delivery_address,
          shipping_fee: event.shipping_fee,
          repeated_from_id: event.id,
        })
        .select()
        .single();
      if (error) throw error;

      if (participants && participants.length > 0) {
        const rows = participants.map((p) => ({
          event_id: newEvent.id,
          store_id: event.store_id,
          client_id: p.client_id,
          full_name: p.full_name,
          phone: p.phone,
          style_key: p.style_key,
          size_key: p.size_key,
        }));
        const { error: participantsError } = await supabase.from("event_participants").insert(rows);
        if (participantsError) throw participantsError;
      }

      toast.success("Job duplicated — each guest gets a confirm-or-update link");
      navigate({ to: "/events/$eventId", params: { eventId: newEvent.id } });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not duplicate this job"));
    } finally {
      setDuplicating(false);
    }
  }

  async function setRepeatReminder() {
    if (!event) return;
    const months = Number(reminderMonths) || 12;
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    try {
      const { error } = await supabase
        .from("events")
        .update({ repeat_reminder_date: date.toISOString().slice(0, 10) })
        .eq("id", event.id);
      if (error) throw error;
      toast.success("Reminder set");
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not set this reminder"));
    }
  }

  const rushCountdown = useMemo(() => {
    if (event?.turnaround_mode !== "rush") return null;
    const target = event.delivery_date ?? event.measurement_deadline;
    if (!target) return null;
    const days = Math.ceil((new Date(target).getTime() - Date.now()) / 86400000);
    return days;
  }, [event]);

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

  async function toggleSponsored(participant: ParticipantRow) {
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ is_sponsored: !participant.is_sponsored })
        .eq("id", participant.id);
      if (error) throw error;
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this guest"));
    }
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
              {jobTemplate(event.job_type).label}
              {" · "}
              {event.event_date ? new Date(event.event_date).toLocaleDateString() : "No date set"}
              {event.fabric_description ? ` · ${event.fabric_description}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="border-gold text-gold">
              {event.status}
            </Badge>
            {canManage && (
              <Button size="sm" variant="outline" onClick={duplicateJob} disabled={duplicating}>
                {duplicating ? "Duplicating..." : "Duplicate"}
              </Button>
            )}
          </div>
        </div>

        {rushCountdown != null && (
          <div className="mt-4 rounded-xl border border-owed/40 bg-owed/10 p-3 text-sm text-owed">
            {rushCountdown > 0
              ? `Rush job — ${rushCountdown} ${rushCountdown === 1 ? "day" : "days"} left`
              : rushCountdown === 0
                ? "Rush job — due today"
                : `Rush job — ${Math.abs(rushCountdown)} ${Math.abs(rushCountdown) === 1 ? "day" : "days"} overdue`}
          </div>
        )}

        {canManage && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            {event.repeat_reminder_date ? (
              <span>
                We&apos;ll remind you to repeat this on{" "}
                {new Date(event.repeat_reminder_date).toLocaleDateString()}.
              </span>
            ) : (
              <>
                <span>Remind me to repeat this in</span>
                <Input
                  value={reminderMonths}
                  onChange={(e) => setReminderMonths(e.target.value)}
                  inputMode="numeric"
                  className="h-7 w-14 px-2 py-1"
                />
                <span>months</span>
                <Button size="sm" variant="outline" onClick={setRepeatReminder}>
                  Set
                </Button>
              </>
            )}
          </div>
        )}

        <StitchDivider className="my-6" />

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {STATUSES.map((s) => (
            <div key={s.value} className="rounded-xl border border-border p-3 text-center">
              <p className="figures text-xl">{counts[s.value] ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-border p-4">
          <p className="text-sm font-medium">Money summary</p>
          {tierPrice != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Current price band: {formatMoney(tierPrice)} per person at{" "}
              {(participants ?? []).length} {(participants ?? []).length === 1 ? "guest" : "guests"}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Expected</p>
              <p className="figures mt-0.5 font-medium">{formatMoney(moneySummary.expected)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Collected</p>
              <p className="figures mt-0.5 font-medium text-paid">
                {formatMoney(moneySummary.collected)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Outstanding
              </p>
              <p className="figures mt-0.5 font-medium text-owed">
                {formatMoney(moneySummary.outstanding)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Our fee (est.)
              </p>
              <p className="figures mt-0.5 font-medium">
                {formatMoney(moneySummary.fee)}{" "}
                <span className="text-xs text-muted-foreground">({moneySummary.feePercent}%)</span>
              </p>
            </div>
          </div>
          {event.payer_mode !== "each_pays" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {event.payer_mode === "single_payer"
                ? "One payer covers this whole job."
                : "Mixed: mark which guests the payer is covering below."}
            </p>
          )}
        </div>

        {jobTemplate(event.job_type).isContract && currentStore && (
          <div className="mt-6">
            <p className="text-sm font-medium">
              {event.stage === "quote" ? "Quote" : "Invoice"}
              {event.stage === "quote" && (
                <span className="ml-2 font-normal text-muted-foreground">
                  Awaiting client acceptance
                </span>
              )}
            </p>
            <div className="mt-2">
              <QuoteDocument
                variant={event.stage === "quote" ? "quote" : "invoice"}
                data={
                  {
                    storeName: currentStore.name,
                    storeLogoUrl: currentStore.logo_url,
                    storeCity: currentStore.city,
                    storeWhatsapp: currentStore.whatsapp_phone,
                    jobName: event.name,
                    organiserName: event.organiser_name,
                    organiserPhone: event.organiser_phone,
                    description: event.fabric_description,
                    quantity: event.quantity,
                    unitPrice: event.price_per_person,
                    vatEnabled: event.vat_enabled,
                    vatPercent: event.vat_percent,
                    validityDate: event.validity_date,
                    deliveryDate: event.delivery_date,
                    depositPercent: event.deposit_percent,
                    invoiceNumber: event.invoice_number,
                    poNumber: event.po_number,
                    paidAmount: (participants ?? []).reduce((sum, p) => sum + p.paid_amount, 0),
                  } satisfies QuoteData
                }
              />
            </div>
          </div>
        )}

        <MeasuringDayPanel
          eventId={event.id}
          storeId={event.store_id}
          canManage={canManage}
          participants={participants ?? []}
          onChanged={invalidate}
        />

        <JobBatchesPanel
          eventId={event.id}
          storeId={event.store_id}
          canManage={canManage}
          participants={participants ?? []}
          organiserPhone={event.organiser_phone}
          jobName={event.name}
          onChanged={invalidate}
        />

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
                    {event.payer_mode === "mixed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleSponsored(participant)}
                      >
                        {participant.is_sponsored ? "Payer covers this" : "Pays themself"}
                      </Button>
                    )}
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
