import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SewRequestForm({
  open,
  onOpenChange,
  storeId,
  itemId,
  itemTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  itemId: string;
  itemTitle: string;
}) {
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [fabricSource, setFabricSource] = useState<"customer" | "tailor">("customer");
  const [measurementChoice, setMeasurementChoice] = useState<"self" | "book">("self");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhoneRaw("");
    setFabricSource("customer");
    setMeasurementChoice("self");
    setNotes("");
    setSubmitted(false);
    setPhoneError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPhoneError(null);
    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) {
      setPhoneError("Enter a valid Nigerian phone number");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("sew_requests").insert({
        store_id: storeId,
        item_id: itemId,
        client_name: name.trim(),
        phone,
        fabric_source: fabricSource,
        measurement_choice: measurementChoice,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not send your request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl">
            {submitted ? "Request sent" : `Sew ${itemTitle} for me`}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-2 pb-4">
          {submitted ? (
            <p className="text-sm text-muted-foreground">
              The shop will reach out on WhatsApp to confirm your order.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sew-name">Your name</Label>
                <Input
                  id="sew-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sew-phone">WhatsApp number</Label>
                <Input
                  id="sew-phone"
                  value={phoneRaw}
                  onChange={(e) => setPhoneRaw(e.target.value)}
                  placeholder="0803 123 4567"
                  required
                />
                {phoneError && <p className="text-sm text-owed">{phoneError}</p>}
              </div>
              <div className="space-y-2">
                <Label>Fabric</Label>
                <Select
                  value={fabricSource}
                  onValueChange={(v) => setFabricSource(v as "customer" | "tailor")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">I have fabric</SelectItem>
                    <SelectItem value="tailor">Please buy fabric for me</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Measurements</Label>
                <Select
                  value={measurementChoice}
                  onValueChange={(v) => setMeasurementChoice(v as "self" | "book")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">I'll fill my measurements myself</SelectItem>
                    <SelectItem value="book">Book a measurement appointment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sew-notes">Anything else?</Label>
                <Textarea
                  id="sew-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending..." : "Send request"}
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
