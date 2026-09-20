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

export const Route = createFileRoute("/custom")({
  head: () => ({
    meta: [
      { title: "Custom plan — Jaylor" },
      {
        name: "description",
        content:
          "Your own WhatsApp number, your own domain, integrations and a migration from your old system.",
      },
    ],
  }),
  component: Custom,
});

function Custom() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Built around your fashion house</h1>
          <p className="mt-4 text-muted-foreground">
            Your own WhatsApp number, your own domain, integrations with tools you already use, and
            a guided migration from your old system. Tell us a bit about your business and
            we&apos;ll be in touch.
          </p>
        </div>

        <StitchDivider className="my-8" />

        <CustomForm />
      </section>
    </MarketingLayout>
  );
}

function CustomForm() {
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
        source: "custom_tier",
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
        <Label htmlFor="custom-name">Your name</Label>
        <Input id="custom-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="custom-phone">Phone</Label>
          <Input
            id="custom-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0803 123 4567"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-email">Email</Label>
          <Input
            id="custom-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="custom-message">Tell us about your business</Label>
        <Textarea
          id="custom-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How many staff, how many locations, what you'd like to migrate from..."
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {busy ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
