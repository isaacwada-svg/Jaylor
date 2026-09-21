import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  ADD_ONS,
  BILLING_PERIODS,
  COMPARISON_ROWS,
  PRICE_TIERS,
  PRICING_FAQ,
  PRICING_GUARANTEE,
  type BillingPeriod,
} from "@/lib/pricing-content";

export const Route = createFileRoute("/pricing")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Pricing — Jaylor" },
      {
        name: "description",
        content:
          "Monthly, quarterly or yearly plans for tailors and fashion houses in Nigeria. Every new store gets a 14-day Growth trial, no card required.",
      },
      { property: "og:title", content: "Pricing — Jaylor" },
      {
        property: "og:description",
        content: "Simple, honest pricing for tailors and fashion houses in Nigeria.",
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
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Simple, honest pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Every new store gets 14 days of Growth free, no card required. Downgrading never deletes
            your data: over-limit items just become read-only.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-card p-1">
            {BILLING_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "touch-target flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
                {p.badge && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      period === p.value && "border-primary-foreground/40",
                    )}
                  >
                    {p.badge}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRICE_TIERS.map((plan) => {
            const price = plan.prices[period];
            return (
              <Card
                key={plan.tier}
                className={cn("relative rounded-2xl", plan.mostPopular && "border-gold")}
              >
                {plan.mostPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most popular
                  </span>
                )}
                <CardContent className="flex h-full flex-col p-6">
                  <TierBadge tier={plan.tier} />
                  {price ? (
                    <>
                      <p className="mt-3 text-2xl">{price.perMonth}</p>
                      {period !== "monthly" && (
                        <p className="text-xs text-muted-foreground">
                          Billed {price.total} {period}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-2xl">By quote</p>
                  )}
                  <p className="mt-3 text-sm text-muted-foreground">{plan.blurb}</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                        {f}
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                      Jaylor Pay at {plan.jaylorPayFee}
                    </li>
                  </ul>
                  <div className="mt-6 pt-2">
                    {plan.cta === "custom" ? (
                      <Button asChild className="w-full" variant="outline">
                        <Link to="/custom">Talk to us</Link>
                      </Button>
                    ) : (
                      <Button
                        asChild
                        className="w-full"
                        variant={plan.mostPopular ? "premium" : "outline"}
                      >
                        <Link to="/auth" search={{ mode: "signup" }}>
                          {plan.tier === "Free" ? "Start free" : "Start 14-day trial"}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-gold/40 bg-accent/30 p-6 text-center">
          <p className="font-heading text-lg">Our guarantee</p>
          <p className="mt-2 text-sm text-muted-foreground">{PRICING_GUARANTEE}</p>
        </div>

        <StitchDivider className="my-14" />

        <div>
          <h2 className="text-center text-2xl">Add-ons</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Optional, and only ever charged when you choose them.
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Included automatic WhatsApp messages are transactional utility messages, not marketing
            campaigns. Provider rules and fair-use limits apply.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {ADD_ONS.map((addOn, i) => (
                  <tr key={addOn.name} className={i > 0 ? "border-t border-border" : ""}>
                    <td className="p-4 text-muted-foreground">
                      {addOn.href ? (
                        <Link to={addOn.href} className="underline underline-offset-2">
                          {addOn.name}
                        </Link>
                      ) : (
                        addOn.name
                      )}
                    </td>
                    <td className="p-4 text-right font-medium">{addOn.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <StitchDivider className="my-14" />

        <div>
          <h2 className="text-center text-2xl">Compare all features</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/30 text-left">
                  <th className="p-4 font-medium">Feature</th>
                  {PRICE_TIERS.map((p) => (
                    <th key={p.tier} className="p-4 font-medium">
                      {p.tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.label} className={i > 0 ? "border-t border-border" : ""}>
                    <td className="p-4 text-muted-foreground">{row.label}</td>
                    {PRICE_TIERS.map((p) => (
                      <td key={p.tier} className="p-4">
                        {row.values[p.tier]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <StitchDivider className="my-14" />

        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl">Pricing questions</h2>
          <Accordion type="single" collapsible className="mt-6">
            {PRICING_FAQ.map((item, i) => (
              <AccordionItem key={item.question} value={`faq-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="mx-auto mt-14 max-w-2xl text-center">
          <Button asChild variant="outline">
            <Link to="/custom">Need something custom?</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
