import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { RemindButton } from "@/components/jaylor/remind-button";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { groupFittingSlotsByDay, formatFittingSlotTime } from "@/lib/fitting-slots";
import { fittingBookingLinkMessage, fittingReminderMessage } from "@/lib/whatsapp";
import { getErrorMessage } from "@/lib/utils";

type Consultation = Tables<"consultations">;

const PURPOSE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  fitting: "Fitting",
  final_fitting: "Final fitting",
  pickup: "Pickup",
};

export function OrderFittingsCard({
  storeId,
  storeName,
  orderId,
  orderStatus,
  client,
}: {
  storeId: string;
  storeName: string;
  orderId: string;
  orderStatus: string;
  client: {
    id: string;
    full_name: string;
    phone: string;
    whatsapp_phone: string | null;
    consent_whatsapp: boolean;
  } | null;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [bookOpen, setBookOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  // Book/reschedule/cancel are all enforced server-side (owner/manager
  // always, a tailor only for an order assigned to them) -- the buttons are
  // shown to any staff role and the server rejects with a clear error if
  // they're not allowed, rather than duplicating the role/assignment logic
  // here for a purely cosmetic hide.
  const orderOpen = orderStatus !== "collected" && orderStatus !== "cancelled";

  const { data: fittings, isLoading } = useQuery({
    queryKey: ["order-fittings", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("*")
        .eq("order_id", orderId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["order-fittings", orderId] });
  }

  async function cancelFitting(id: string) {
    setActingOn(id);
    try {
      const { error } = await supabase.rpc("cancel_fitting", { p_consultation_id: id });
      if (error) throw error;
      toast.success("Fitting cancelled");
      invalidate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not cancel this fitting"));
    } finally {
      setActingOn(null);
    }
  }

  async function sendBookingLink() {
    if (!client) return;
    setLinkBusy(true);
    try {
      const { data: link, error } = await supabase.rpc("create_fitting_link", {
        p_order_id: orderId,
        p_purpose: "fitting",
      });
      if (error) throw error;
      const token = (link as Tables<"fitting_links">).token;
      const url = `${window.location.origin}/f/${token}`;
      const message = fittingBookingLinkMessage(client.full_name, storeName, url);
      window.open(
        `https://wa.me/${(client.whatsapp_phone ?? client.phone).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("messages").insert({
        store_id: storeId,
        client_id: client.id,
        order_id: orderId,
        template: "fitting_booking_link",
        channel: "tap",
        sent_by: userData.user?.id ?? null,
      });
      toast.success("Booking link sent");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create a booking link"));
    } finally {
      setLinkBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = (fittings ?? []).filter(
    (f) => f.status !== "cancelled" && new Date(f.starts_at).getTime() >= now,
  );
  const past = (fittings ?? []).filter(
    (f) => f.status === "cancelled" || new Date(f.starts_at).getTime() < now,
  );

  return (
    <div className="rounded-2xl border border-border p-4 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Fittings</p>
        {orderOpen && client && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBookOpen(true)}
              disabled={!online}
            >
              <CalendarPlus className="size-4" />
              Book fitting
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={sendBookingLink}
              disabled={!online || linkBusy || !client.consent_whatsapp}
              title={
                client.consent_whatsapp ? undefined : "This client hasn't given WhatsApp consent"
              }
            >
              <MessageCircle className="size-4" />
              {linkBusy ? "Sending..." : "Send booking link"}
            </Button>
          </div>
        )}
      </div>

      {!orderOpen && (
        <p className="mt-2 text-xs text-muted-foreground">
          This order is no longer open for fittings.
        </p>
      )}

      {isLoading ? null : (fittings ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No fittings yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {[...upcoming, ...past].map((f) => {
            const startsAt = new Date(f.starts_at);
            const withinDay =
              startsAt.getTime() - now < 24 * 60 * 60_000 && startsAt.getTime() > now;
            return (
              <div key={f.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{PURPOSE_LABELS[f.purpose] ?? f.purpose}</p>
                    <p className="text-muted-foreground">
                      {startsAt.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {formatFittingSlotTime(f.starts_at)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      f.status === "cancelled" ? "border-owed text-owed" : "border-gold text-gold"
                    }
                  >
                    {f.status}
                  </Badge>
                </div>
                {f.notes && <p className="mt-1 text-muted-foreground">{f.notes}</p>}
                {f.status !== "cancelled" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {withinDay && client && (
                      <RemindButton
                        storeId={storeId}
                        clientId={client.id}
                        orderId={orderId}
                        phone={client.whatsapp_phone ?? client.phone}
                        consentWhatsapp={client.consent_whatsapp}
                        template="fitting_reminder"
                        message={fittingReminderMessage(client.full_name, storeName, startsAt)}
                        label="Send reminder"
                      />
                    )}
                    {orderOpen && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actingOn === f.id}
                        onClick={() => cancelFitting(f.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BookFittingDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        storeId={storeId}
        orderId={orderId}
        online={online}
        onBooked={invalidate}
      />
    </div>
  );
}

function BookFittingDialog({
  open,
  onOpenChange,
  storeId,
  orderId,
  online,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  orderId: string;
  online: boolean;
  onBooked: () => void;
}) {
  const [purpose, setPurpose] = useState("fitting");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPurpose("fitting");
      setSelectedSlot(null);
      setNotes("");
    }
  }, [open]);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["store-fitting-availability", storeId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_fitting_availability", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });

  async function save() {
    if (!selectedSlot) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("book_fitting", {
        p_order_id: orderId,
        p_starts_at: selectedSlot,
        p_purpose: purpose,
        ...(notes.trim() ? { p_notes: notes.trim() } : {}),
      });
      if (error) throw error;
      toast.success("Fitting booked");
      onBooked();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not book this fitting"));
    } finally {
      setSaving(false);
    }
  }

  const groups = groupFittingSlotsByDay(slots ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book fitting</DialogTitle>
        </DialogHeader>

        {!online ? (
          <OfflineNotice label="Connect to the internet to book a fitting." />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fitting">Fitting</SelectItem>
                  <SelectItem value="final_fitting">Final fitting</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading available times...</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open times in the next two weeks.</p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {groups.map((group) => (
                  <div key={group.day}>
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      {group.day}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {group.times.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-lg border px-3 py-1.5 text-sm ${
                            selectedSlot === slot
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-border hover:bg-accent/60"
                          }`}
                        >
                          {formatFittingSlotTime(slot)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              placeholder="Notes (optional)"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button disabled={!selectedSlot || saving || !online} onClick={save}>
            {saving ? "Booking..." : "Book fitting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
