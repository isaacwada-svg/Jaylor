import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/contact")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Contact & support — Jaylor" },
      {
        name: "description",
        content: "Questions, a bug to report, or help with your store — send us a message.",
      },
      { property: "og:title", content: "Contact & support — Jaylor" },
      {
        property: "og:description",
        content: "Questions, a bug to report, or help with your store — send us a message.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Contact & support</h1>
          <p className="mt-4 text-muted-foreground">
            A question, a bug to report, or help with your store — send us a message and we&apos;ll
            get back to you.
          </p>
        </div>

        <StitchDivider className="my-8" />

        <ContactForm />
      </section>
    </MarketingLayout>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("leads").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        message: message.trim() || null,
        source: "contact",
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send your message. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-xl">Thank you</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ve received your message and will be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="contact-name">Your name</Label>
        <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contact-phone">Phone</Label>
          <Input
            id="contact-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0803 123 4567"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">How can we help?</Label>
        <Textarea
          id="contact-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="A question, a bug you've run into, or anything else"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !message.trim()}>
        {busy ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
