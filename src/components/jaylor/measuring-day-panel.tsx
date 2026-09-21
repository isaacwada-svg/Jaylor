import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatPhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ParticipantRow = Tables<"event_participants">;
type SessionRow = Tables<"event_measuring_sessions">;

/**
 * Group-production tool from the doc's G4 step: schedule one or more
 * measuring-day sessions, and let the shop check people off as measured on
 * the day. Participants pick their own slot on the guest page; this is the
 * shop's side — creating sessions and working the checklist.
 */
export function MeasuringDayPanel({
  eventId,
  storeId,
  canManage,
  participants,
  onChanged,
}: {
  eventId: string;
  storeId: string;
  canManage: boolean;
  participants: ParticipantRow[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState("");
  const [sessionTime, setSessionTime] = useState("");
  const [venue, setVenue] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: sessions } = useQuery({
    queryKey: ["event-measuring-sessions", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_measuring_sessions")
        .select("*")
        .eq("event_id", eventId)
        .order("session_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  function invalidateSessions() {
    queryClient.invalidateQueries({ queryKey: ["event-measuring-sessions", eventId] });
  }

  async function createSession(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!sessionDate.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("event_measuring_sessions").insert({
        event_id: eventId,
        store_id: storeId,
        session_date: sessionDate,
        session_time: sessionTime.trim() || null,
        venue: venue.trim() || null,
      });
      if (error) throw error;
      toast.success("Measuring session added");
      setSessionDate("");
      setSessionTime("");
      setVenue("");
      setCreateOpen(false);
      invalidateSessions();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this session"));
    } finally {
      setBusy(false);
    }
  }

  async function markMeasured(participant: ParticipantRow) {
    try {
      const { error } = await supabase
        .from("event_participants")
        .update({ status: "measured" })
        .eq("id", participant.id);
      if (error) throw error;
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this guest"));
    }
  }

  if (!sessions || (sessions.length === 0 && !canManage)) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Measuring day</p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New session
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Schedule a session so guests can pick a slot instead of coming in whenever.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {sessions.map((session: SessionRow) => {
            const assigned = participants.filter((p) => p.measuring_session_id === session.id);
            const measuredCount = assigned.filter((p) => p.status !== "invited").length;
            const expanded = expandedId === session.id;
            return (
              <div key={session.id} className="rounded-xl border border-border p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : session.id)}
                  className="flex w-full items-center justify-between gap-2 text-left text-sm"
                >
                  <span>
                    {new Date(session.session_date).toLocaleDateString()}
                    {session.session_time ? ` · ${session.session_time}` : ""}
                    {session.venue ? ` · ${session.venue}` : ""}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {measuredCount}/{assigned.length} measured
                    {expanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </span>
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {assigned.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No guest has picked this slot yet.
                      </p>
                    ) : (
                      assigned.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm">{p.full_name}</p>
                            <p className="figures text-xs text-muted-foreground">
                              {formatPhoneNG(p.phone)}
                            </p>
                          </div>
                          {p.status === "invited" ? (
                            <Button size="sm" variant="outline" onClick={() => markMeasured(p)}>
                              Mark measured
                            </Button>
                          ) : (
                            <span className="text-xs text-paid">Measured</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New measuring session</DialogTitle>
          </DialogHeader>
          <form onSubmit={createSession} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="session-date">Date</Label>
                <Input
                  id="session-date"
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-time">Time</Label>
                <Input
                  id="session-time"
                  value={sessionTime}
                  onChange={(e) => setSessionTime(e.target.value)}
                  placeholder="10am – 2pm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-venue">Venue</Label>
              <Input
                id="session-venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Shop address or venue"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !sessionDate.trim()}>
              {busy ? "Adding..." : "Add session"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
