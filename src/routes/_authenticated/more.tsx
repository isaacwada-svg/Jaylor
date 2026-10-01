import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/jaylor/app-shell";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { DiscoveryCue } from "@/components/jaylor/discovery-cue";
import { useFeatureDiscovery } from "@/lib/feature-discovery";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  Users2,
  Receipt,
  Sparkles,
  Settings,
  ShieldCheck,
  Wallet,
  FileText,
  Gift,
  LifeBuoy,
  LogOut,
  Calculator,
  Coins,
  Boxes,
  BarChart3,
  Radar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useStore } from "@/lib/store-context";
import type { Tier } from "@/lib/jaylor";
import type { DiscoveryFeature } from "@/lib/feature-discovery";

export const Route = createFileRoute("/_authenticated/more")({
  staticData: { sitemap: false },
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

const ITEMS: {
  label: string;
  hint: string;
  icon: typeof Users2;
  tier?: Tier;
  feature?: DiscoveryFeature;
  roles?: ("owner" | "manager" | "tailor")[];
}[] = [
  {
    label: "Consultations",
    hint: "Bookings and video fittings",
    icon: CalendarClock,
    tier: "Growth",
  },
  {
    label: "Group events",
    hint: "Aso-ebi and family sets",
    icon: Users2,
    tier: "Growth",
    feature: "group_orders",
  },
  {
    label: "Quotations",
    hint: "Quote a customer, then convert to a sale",
    icon: Calculator,
    tier: "Growth",
  },
  {
    label: "Contracts",
    hint: "School and company uniform jobs",
    icon: FileText,
    tier: "Business",
  },
  {
    label: "Staff and job board",
    hint: "Assign work, see workload",
    icon: Users2,
    tier: "Business",
  },
  {
    label: "Staff payroll",
    hint: "Piece-rate pay, advances and payroll runs",
    icon: Coins,
    tier: "Business",
    roles: ["owner", "manager"],
  },
  {
    label: "My earnings",
    hint: "What you've earned per garment and stage",
    icon: Coins,
    roles: ["tailor"],
  },
  {
    label: "Inventory",
    hint: "Stock of linings, zips, thread and other materials",
    icon: Boxes,
    tier: "Business",
  },
  { label: "Expenses and reports", hint: "Costs and net profit", icon: Receipt, tier: "Business" },
  {
    label: "Business report",
    hint: "A monthly summary you can share with a bank or partner",
    icon: BarChart3,
    tier: "Business",
  },
  { label: "Payments and receipts", hint: "Balances and receipts", icon: Wallet },
  {
    label: "Tailor directory listing",
    hint: "How clients find you in the Jaylor directory",
    icon: Radar,
  },
  { label: "Moments", hint: "Birthdays, festive greetings, check-ins", icon: Gift },
  {
    label: "AI tools",
    hint: "Customer style requests from your shop",
    icon: Sparkles,
    tier: "Growth",
    feature: "ai_design",
  },
  { label: "Privacy and data", hint: "Consent, exports, support access", icon: ShieldCheck },
  { label: "Settings and billing", hint: "Store, plan, team", icon: Settings },
  {
    label: "Contact and support",
    hint: "Questions, bugs, or help with your store",
    icon: LifeBuoy,
  },
];

function More() {
  const discovery = useFeatureDiscovery();
  const navigate = useNavigate();
  const { currentRole } = useStore();

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate({ to: "/auth" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not sign out — try again"));
    }
  }

  const visibleItems = ITEMS.filter(
    (item) => !item.roles || (currentRole && item.roles.includes(currentRole)),
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl">More</h1>
        <StitchDivider className="my-6" />
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleItems.map(({ label, hint, icon: Icon, tier, feature }) => {
            const iconSpan = (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-gold">
                {feature ? (
                  <DiscoveryCue
                    show={discovery.isUnseen(feature)}
                    pulse={discovery.shouldPulse(feature)}
                  >
                    <Icon className="size-5" />
                  </DiscoveryCue>
                ) : (
                  <Icon className="size-5" />
                )}
              </span>
            );
            const content = (
              <CardContent className="flex items-start gap-3 p-4">
                {iconSpan}
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
            if (label === "Quotations") {
              return (
                <Link key={label} to="/quotations">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Contracts") {
              return (
                <Link key={label} to="/contracts">
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
            if (label === "Staff payroll") {
              return (
                <Link key={label} to="/payroll">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "My earnings") {
              return (
                <Link key={label} to="/my-earnings">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Inventory") {
              return (
                <Link key={label} to="/inventory">
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
            if (label === "Business report") {
              return (
                <Link key={label} to="/business-report">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Tailor directory listing") {
              return (
                <Link key={label} to="/shop" search={{ tab: "profile" }} hash="directory-listing">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Payments and receipts") {
              return (
                <Link key={label} to="/payments">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "Moments") {
              return (
                <Link key={label} to="/moments">
                  <Card className="rounded-2xl transition-colors hover:bg-accent/40">
                    {content}
                  </Card>
                </Link>
              );
            }
            if (label === "AI tools") {
              return (
                <Link
                  key={label}
                  to="/ai-designs"
                  onClick={() => void discovery.markUsed("ai_design")}
                >
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
            if (label === "Contact and support") {
              return (
                <Link key={label} to="/contact">
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

        <Button
          variant="outline"
          className="mt-6 w-full justify-center gap-2 text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </AppShell>
  );
}
