import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { SUPPORT_PHONE } from "@/lib/jaylor";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/import")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Notebook import service — Jaylor" },
      {
        name: "description",
        content:
          "Send us photos of your paper notebook and we'll type in your clients, measurements and past orders for you.",
      },
      { property: "og:title", content: "Notebook import service — Jaylor" },
      {
        property: "og:description",
        content: "We'll type in your notebook for you, from photos sent on WhatsApp.",
      },
    ],
  }),
  component: ImportPage,
});

const WHATSAPP_MESSAGE =
  "Hello Jaylor, I'd like help importing my notebook. I've sent a request on your website.";

function ImportPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Let us type in your notebook</h1>
          <p className="mt-4 text-muted-foreground">
            Keep sewing. Send us photos of your paper notebook and we&apos;ll turn every client,
            measurement and past order into your Jaylor account for you. No typing required on your
            side.
          </p>
        </div>

        <StitchDivider className="my-8" />

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              1. Fill in the form below so we know who you are and roughly how much to import.
            </li>
            <li>
              2. Send clear photos of each notebook page to our WhatsApp number. One page per photo
              is easiest.
            </li>
            <li>
              3. We type it all in and let you know on WhatsApp when it&apos;s ready to check.
            </li>
          </ol>
          <p className="mt-4 text-sm">
            <span className="font-medium">Price:</span> ₦10,000 one-off, any size notebook.
            <br />
            <span className="font-medium">Turnaround:</span> usually 2–3 working days after we
            receive your photos.
          </p>
          <a
            href={whatsappLink(SUPPORT_PHONE, WHATSAPP_MESSAGE)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gold"
          >
            <MessageCircle className="size-4" />
            Send your notebook photos on WhatsApp
          </a>
        </div>

        <div className="mt-8">
          <ImportForm />
        </div>
      </section>
    </MarketingLayout>
  );
}

function ImportForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [clientCount, setClientCount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const message = [
        clientCount.trim() ? `Roughly how many clients: ${clientCount.trim()}` : null,
        notes.trim() || null,
      ]
        .filter(Boolean)
        .join("\n");
      const { error } = await supabase.from("leads").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        message: message || null,
        source: "notebook_import",
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send your request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-xl">Request received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Now send us photos of your notebook pages on WhatsApp and we&apos;ll get started.
        </p>
        <a
          href={whatsappLink(SUPPORT_PHONE, WHATSAPP_MESSAGE)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gold"
        >
          <MessageCircle className="size-4" />
          Open WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="import-name">Your name</Label>
        <Input id="import-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="import-phone">WhatsApp number</Label>
          <Input
            id="import-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0803 123 4567"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-count">Roughly how many clients</Label>
          <Input
            id="import-count"
            value={clientCount}
            onChange={(e) => setClientCount(e.target.value)}
            placeholder="e.g. 80"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-notes">Anything else we should know</Label>
        <Textarea
          id="import-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Old notebooks, receipt books, a mix of both..."
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !phone.trim()}>
        {busy ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
}
