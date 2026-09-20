import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientRow = Tables<"clients">;
type ConsultationType = "measurement" | "fitting" | "style" | "video";

const TYPES: { value: ConsultationType; label: string }[] = [
  { value: "measurement", label: "Measurement" },
  { value: "fitting", label: "Fitting" },
  { value: "style", label: "Style" },
  { value: "video", label: "Video" },
];

const DURATIONS = [15, 30, 45, 60] as const;

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ConsultationForm({
  open,
  onOpenChange,
  storeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [type, setType] = useState<ConsultationType>("measurement");
  const [startsAt, setStartsAt] = useState(() => toLocalDatetimeValue(new Date()));
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(30);
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientSearch("");
    setSelectedClient(null);
    setType("measurement");
    setStartsAt(toLocalDatetimeValue(new Date()));
    setDuration(30);
    setMeetingLink("");
    setNotes("");
  }, [open]);

  const { data: clientResults } = useQuery({
    queryKey: ["consultation-form-clients", storeId, clientSearch],
    enabled: open && !selectedClient && clientSearch.trim().length > 0,
    queryFn: async () => {
      const term = clientSearch.trim().replace(/"/g, '\\"');
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("store_id", storeId)
        .or(`full_name.ilike."%${term}%",phone.ilike."%${term}%"`)
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedClient) {
      toast.error("Pick a client first");
      return;
    }
    setBusy(true);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + duration * 60_000);
      const { error } = await supabase.from("consultations").insert({
        store_id: storeId,
        client_id: selectedClient.id,
        type,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        meeting_link: type === "video" ? meetingLink.trim() || null : null,
        notes: notes.trim() || null,
        source: "staff",
      });
      if (error) throw error;
      toast.success("Consultation booked");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not book this consultation"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Client</Label>
        {selectedClient ? (
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="font-medium">{selectedClient.full_name}</p>
              <p className="figures text-sm text-muted-foreground">
                {formatPhoneNG(selectedClient.phone)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search name or phone"
                className="pl-9"
              />
            </div>
            {clientResults && clientResults.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                {clientResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClient(c)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/60"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback>{c.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.full_name}</p>
                      <p className="figures truncate text-xs text-muted-foreground">
                        {formatPhoneNG(c.phone)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ConsultationType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Duration</Label>
          <Select
            value={String(duration)}
            onValueChange={(v) => setDuration(Number(v) as (typeof DURATIONS)[number])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="consultation-start">Date and time</Label>
        <Input
          id="consultation-start"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
      </div>

      {type === "video" && (
        <div className="space-y-2">
          <Label htmlFor="meeting-link">Meeting link</Label>
          <Input
            id="meeting-link"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="Google Meet link, or leave blank for WhatsApp video"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="consultation-notes">Notes</Label>
        <Textarea
          id="consultation-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Booking..." : "Book consultation"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl">New consultation</SheetTitle>
          </SheetHeader>
          <div className="mt-2 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New consultation</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
