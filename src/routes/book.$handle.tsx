import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark } from "@/components/jaylor/logo";
import { normalizePhoneNG } from "@/lib/phone";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/book/$handle")({
  head: () => ({
    meta: [{ title: "Book a consultation — Jaylor" }],
  }),
  component: BookConsultation,
});

type ConsultationType = "measurement" | "fitting" | "style" | "video";

const TYPES: { value: ConsultationType; label: string }[] = [
  { value: "measurement", label: "Measurement" },
  { value: "fitting", label: "Fitting" },
  { value: "style", label: "Style consultation" },
  { value: "video", label: "Video call" },
];

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function BookConsultation() {
  const { handle } = Route.useParams();

  const {
    data: store,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stores-public", handle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores_public")
        .select("*")
        .eq("slug", handle)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [type, setType] = useState<ConsultationType>("measurement");
  const [preferredAt, setPreferredAt] = useState(() =>
    toLocalDatetimeValue(new Date(Date.now() + 24 * 60 * 60_000)),
  );
  const [note, setNote] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPhoneError(null);
    if (!store) return;

    const phone = normalizePhoneNG(phoneRaw);
    if (!phone) {
      setPhoneError("Enter a valid Nigerian phone number");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("consultation_requests").insert({
        store_id: store.id ?? "",
        name: name.trim(),
        phone,
        type,
        preferred_at: new Date(preferredAt).toISOString(),
        note: note.trim() || null,
        consent_whatsapp: consentWhatsapp,
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
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2">
          <LogoMark className="size-9" />
          <span className="font-heading text-2xl">Jaylor</span>
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error || !store ? (
            <div className="py-4 text-center">
              <h1 className="text-xl">We couldn&apos;t find that page</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Double-check the link your tailor shared with you.
              </p>
            </div>
          ) : submitted ? (
            <div className="py-4 text-center">
              <h1 className="text-xl">Request sent</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {store.name} will confirm your consultation by WhatsApp shortly.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl">Book a consultation with {store.name}</h1>
              {store.city && <p className="mt-1 text-sm text-muted-foreground">{store.city}</p>}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="book-name">Your name</Label>
                  <Input
                    id="book-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-phone">WhatsApp number</Label>
                  <Input
                    id="book-phone"
                    value={phoneRaw}
                    onChange={(e) => setPhoneRaw(e.target.value)}
                    placeholder="0803 123 4567"
                    required
                  />
                  {phoneError && <p className="text-sm text-owed">{phoneError}</p>}
                </div>
                <div className="space-y-2">
                  <Label>What do you need?</Label>
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
                  <Label htmlFor="book-when">Preferred date and time</Label>
                  <Input
                    id="book-when"
                    type="datetime-local"
                    value={preferredAt}
                    onChange={(e) => setPreferredAt(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-note">Anything we should know?</Label>
                  <Textarea
                    id="book-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">WhatsApp updates</p>
                    <p className="text-xs text-muted-foreground">
                      Get your booking confirmation and reminders
                    </p>
                  </div>
                  <Switch checked={consentWhatsapp} onCheckedChange={setConsentWhatsapp} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Sending..." : "Request consultation"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
