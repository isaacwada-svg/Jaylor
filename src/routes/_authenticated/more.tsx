import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarClock,
  Users2,
  Receipt,
  Sparkles,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Tier } from "@/lib/jaylor";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({
    meta: [
      { title: "More — Jaylor" },
      {
        name: "description",
        content:
          "Consultations, events, staff, reports, AI tools, billing and settings for your fashion house.",
      },
      { property: "og:title", content: "More — Jaylor" },
      {
        property: "og:description",
        content: "Consultations, events, staff, reports, billing and settings.",
      },
    ],
  }),
  component: More,
});

const ITEMS: { label: string; hint: string; icon: typeof Users2; tier?: Tier }[] = [
  {
    label: "Consultations",
    hint: "Bookings and video fittings",
    icon: CalendarClock,
    tier: "Growth",
  },
  { label: "Group events", hint: "Aso-ebi and family sets", icon: Users2, tier: "Growth" },
  {
    label: "Staff and job board",
    hint: "Assign work, see workload",
    icon: Users2,
    tier: "Business",
  },
  { label: "Expenses and reports", hint: "Costs and net profit", icon: Receipt, tier: "Business" },
  { label: "Payments and receipts", hint: "Balances and receipts", icon: Wallet },
  { label: "AI tools", hint: "Style previews, captions", icon: Sparkles, tier: "Growth" },
  { label: "Privacy and data", hint: "Consent, exports, support access", icon: ShieldCheck },
  { label: "Settings and billing", hint: "Store, plan, team", icon: Settings },
];

function More() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">More</h1>
        <StitchDivider className="my-6" />
        <div className="grid gap-3 sm:grid-cols-2">
          {ITEMS.map(({ label, hint, icon: Icon, tier }) => {
            const content = (
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-gold">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{label}</p>
                    {tier ? <TierBadge tier={tier} /> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
                </div>
              </CardContent>
            );
            if (label === "Settings and billing") {
              return (
                <Link key={label} to="/billing">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Consultations") {
              return (
                <Link key={label} to="/consultations">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Group events") {
              return (
                <Link key={label} to="/events">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Staff and job board") {
              return (
                <Link key={label} to="/staff">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Expenses and reports") {
              return (
                <Link key={label} to="/reports">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Privacy and data") {
              return (
                <Link key={label} to="/privacy">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            return (
              <Card key={label} className="rounded-2xl">
                {content}
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
