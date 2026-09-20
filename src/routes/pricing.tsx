import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PRICING_PLANS } from "@/lib/jaylor";

export const Route = createFileRoute("/pricing")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Pricing — Jaylor" },
      {
        name: "description",
        content:
          "Simple, honest pricing for tailors and fashion houses. Free to start, with a 14-day Growth trial for every new store.",
      },
      { property: "og:title", content: "Pricing — Jaylor" },
      {
        property: "og:description",
        content: "Simple pricing for Nigerian tailors and fashion houses, free to start.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Simple, honest pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Every new store gets 14 days of Growth free. Downgrading never deletes or hides your
            data — over-limit items just become read-only.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_PLANS.map((plan) => (
            <Card
              key={plan.tier}
              className={plan.tier === "Growth" ? "rounded-2xl border-gold" : "rounded-2xl"}
            >
              <CardContent className="flex h-full flex-col p-6">
                <TierBadge tier={plan.tier} />
                <p className="mt-3 text-2xl">{plan.price}</p>
                <p className="text-xs text-muted-foreground">{plan.billing}</p>
                <p className="mt-3 text-sm text-muted-foreground">{plan.blurb}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-2">
                  {plan.tier === "Custom" ? (
                    <Button asChild className="w-full" variant="outline">
                      <Link to="/custom">Talk to us</Link>
                    </Button>
                  ) : (
                    <Button
                      asChild
                      className="w-full"
                      variant={plan.tier === "Growth" ? "default" : "outline"}
                    >
                      <Link to="/auth" search={{ mode: "signup" }}>
                        Start free
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <StitchDivider className="my-12" />

        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl">Questions?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every plan includes unlimited clients, versioned measurements, and the same calm order
            tracker. Growth and Business add automatic WhatsApp reminders, storefronts and team
            features as your shop grows. Nothing is ever locked away — you&apos;ll always see
            what&apos;s next and what it costs.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Included automatic WhatsApp messages are transactional utility messages, not marketing
            campaigns. Provider rules and fair-use limits apply.
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link to="/custom">Need something custom?</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
