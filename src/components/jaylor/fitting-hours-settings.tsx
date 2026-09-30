import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

/** Growth+ only -- backs the fitting-slot picker (get_store_fitting_availability). */
export function FittingHoursSettings({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [slotMinutes, setSlotMinutes] = useState("30");
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([0]);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [addingDate, setAddingDate] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["fitting-hours-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select(
          "fitting_hours_start, fitting_hours_end, fitting_slot_minutes, fitting_closed_weekdays",
        )
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: closedDates } = useQuery({
    queryKey: ["store-closed-dates", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_closed_dates")
        .select("*")
        .eq("store_id", storeId)
        .order("closed_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setStartTime(settings.fitting_hours_start?.slice(0, 5) ?? "09:00");
    setEndTime(settings.fitting_hours_end?.slice(0, 5) ?? "18:00");
    setSlotMinutes(String(settings.fitting_slot_minutes ?? 30));
    setClosedWeekdays(settings.fitting_closed_weekdays ?? [0]);
  }, [settings]);

  function toggleWeekday(day: number) {
    setClosedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("store_settings").upsert(
        {
          store_id: storeId,
          fitting_hours_start: `${startTime}:00`,
          fitting_hours_end: `${endTime}:00`,
          fitting_slot_minutes: Number(slotMinutes) || 30,
          fitting_closed_weekdays: closedWeekdays,
        },
        { onConflict: "store_id" },
      );
      if (error) throw error;
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["fitting-hours-settings", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save these hours"));
    } finally {
      setSaving(false);
    }
  }

  async function addClosedDate() {
    if (!newClosedDate) return;
    setAddingDate(true);
    try {
      const { error } = await supabase
        .from("store_closed_dates")
        .insert({ store_id: storeId, closed_date: newClosedDate });
      if (error) throw error;
      setNewClosedDate("");
      queryClient.invalidateQueries({ queryKey: ["store-closed-dates", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add this closed date"));
    } finally {
      setAddingDate(false);
    }
  }

  async function removeClosedDate(id: string) {
    try {
      const { error } = await supabase.from("store_closed_dates").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["store-closed-dates", storeId] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this date"));
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-medium">Fitting hours</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When clients can book a fitting appointment, in your booking link and staff picker.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fitting-start">Opens</Label>
            <Input
              id="fitting-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fitting-end">Closes</Label>
            <Input
              id="fitting-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fitting-slot">Slot length (minutes)</Label>
          <Input
            id="fitting-slot"
            type="number"
            min={5}
            inputMode="numeric"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Closed days each week</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  closedWeekdays.includes(d.value)
                    ? "border-owed bg-owed/10 text-owed"
                    : "border-border hover:bg-accent/60"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save hours"}
        </Button>

        <div className="space-y-2 border-t border-border pt-4">
          <Label>One-off closed dates</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={newClosedDate}
              onChange={(e) => setNewClosedDate(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={addClosedDate}
              disabled={!newClosedDate || addingDate}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {(closedDates ?? []).length > 0 && (
            <div className="space-y-1.5">
              {(closedDates ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm"
                >
                  <span>{new Date(d.closed_date).toLocaleDateString()}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeClosedDate(d.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
