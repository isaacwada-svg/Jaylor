import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/measurement-passport")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Measurement Passport — Jaylor" },
      {
        name: "description",
        content:
          "Your measurements, saved once and yours to share with any tailor on Jaylor. No re-measuring, no lost notebook page.",
      },
      { property: "og:title", content: "Measurement Passport — Jaylor" },
      {
        property: "og:description",
        content: "Save your measurements once. Share them with any Jaylor tailor in one tap.",
      },
    ],
  }),
  component: MeasurementPassportPage,
});

function MeasurementPassportPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Your measurements, saved for good</h1>
          <p className="mt-4 text-muted-foreground">
            Ask your tailor for your Measurement Passport: a private card with your own measurements
            and fit notes. It's yours. Show it to a new tailor and they'll have everything they
            need, without measuring you again.
          </p>
        </div>

        <StitchDivider className="my-8" />

        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureBlock
            title="Only yours"
            body="No prices, no orders, no other client's details. Just your own measurements and notes."
          />
          <FeatureBlock
            title="Always up to date"
            body="Ask for an update any time, straight from the card, and your tailor gets notified."
          />
          <FeatureBlock
            title="Share in one tap"
            body="Moving to a new tailor? Send your card and they'll have your measurements instantly."
          />
        </div>

        <StitchDivider className="my-8" />

        <FindShopCard />
      </section>
    </MarketingLayout>
  );
}

function FeatureBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function FindShopCard() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleaned = handle
      .trim()
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (!cleaned) return;
    setBusy(true);
    try {
      const { data } = await supabase
        .from("stores_public")
        .select("slug")
        .eq("slug", cleaned)
        .maybeSingle();
      if (data?.slug) {
        navigate({ to: "/$handle", params: { handle: data.slug } });
      } else {
        toast.error("We couldn't find that shop on Jaylor");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
      <h2 className="text-lg">Find out if your tailor uses Jaylor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter their shop link or name to see their storefront and ask for your card.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="e.g. adastitches"
        />
        <Button type="submit" disabled={busy || !handle.trim()}>
          <Search className="size-4" />
        </Button>
      </form>
    </div>
  );
}
