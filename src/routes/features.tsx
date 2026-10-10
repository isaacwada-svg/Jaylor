import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  CalendarClock,
  Camera,
  Gauge,
  Globe,
  Package,
  QrCode,
  Radar,
  ShieldCheck,
  Store,
  Wallet,
  WifiOff,
} from "lucide-react";
import { Mic } from "lucide-react";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { UncollectedCalculator } from "@/components/jaylor/uncollected-calculator";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/features")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Features: Jaylor" },
      {
        name: "description",
        content:
          "Order tracking and approval, Jaylor Pay, the Measurement Passport, payroll, inventory, business reports and the tailor directory, explained.",
      },
      { property: "og:title", content: "Features: Jaylor" },
      {
        property: "og:description",
        content: "Everything Jaylor does for tailors and fashion houses, in one place.",
      },
    ],
  }),
  component: FeaturesPage,
});

type FeatureItem = {
  id: string;
  icon: typeof Wallet;
  title: string;
  body: string;
  linkTo?: string;
  linkLabel?: string;
};

const GROUPS: { title: string; items: FeatureItem[] }[] = [
  {
    title: "What your clients see",
    items: [
      {
        id: "track-order",
        icon: Radar,
        title: "Track my order",
        body: "Send each client a link where they can follow their garment from cutting to ready. Fewer “is my cloth ready?” calls, since they can see every update the moment you make it.",
      },
      {
        id: "approve-before-cutting",
        icon: ShieldCheck,
        title: "Approve before cutting",
        body: "Your client sees the fabric photos, style, measurements and price, and taps Approve before you cut. If there is ever a disagreement, you have a record of what was agreed and when.",
      },
      {
        id: "on-time-badge",
        icon: BadgeCheck,
        title: "On-time badge",
        body: "Show clients your real on-time delivery record, taken from your own work in Jaylor, not from reviews. It appears on your storefront and in the tailor directory once you have enough completed orders.",
      },
      {
        id: "measurement-passport",
        icon: QrCode,
        title: "Measurement Passport",
        body: "Give every client a private card of their own measurements, with a link and QR code they own. They can share it with any other Jaylor shop in one tap, so a returning client never has to be measured from scratch again.",
        linkTo: "/passport",
        linkLabel: "Learn more",
      },
    ],
  },
  {
    title: "Running your workroom",
    items: [
      {
        id: "orders-in-place",
        icon: Package,
        title: "Every order, in its place",
        body: "Follow each garment from received to collected, with fittings, deadlines and who is working on it, so nothing falls through the cracks between stages.",
      },
      {
        id: "jaylor-pay",
        icon: Wallet,
        title: "Jaylor Pay",
        body: "Send a client a secure payment link for card, bank transfer or USSD. Money settles straight to your own bank account: Jaylor never holds it, and takes a small fee automatically based on your plan.",
        linkTo: "/pricing",
        linkLabel: "See Jaylor Pay fees",
      },
      {
        id: "no-overbooking",
        icon: Gauge,
        title: "No more overbooking",
        body: "Jaylor warns you when a week is already full, before you promise another date, so December stays manageable instead of chaotic.",
      },
      {
        id: "fabric-on-record",
        icon: Camera,
        title: "Fabric on record",
        body: "Photograph the fabric your client brings, with the date and who received it. No more arguments about what was received.",
      },
      {
        id: "events",
        icon: CalendarClock,
        title: "Group and aso-ebi events",
        body: "Create one link for a whole family, bridal party or group order. Each member measures themselves (or shares their Measurement Passport) and pays their own share, while you see who has measured, who has paid, and who is still outstanding.",
        linkTo: "/auth",
        linkLabel: "Start free",
      },
      {
        id: "offline",
        icon: WifiOff,
        title: "Offline mode",
        body: "On Growth and above, keep taking orders and recording payments even without a connection. Jaylor saves your work on your device and syncs everything the next time you're online, so a bad network day never stops the workroom. On Free, you can still view your orders offline.",
        linkTo: "/auth",
        linkLabel: "Start free",
      },
      {
        id: "notebook-import",
        icon: Package,
        title: "Notebook import service",
        body: "Moving from paper? Send us photos of your notebook and we'll type in your clients, measurements and past orders for a one-off fee, so you start on Jaylor with everything already in place.",
        linkTo: "/import",
        linkLabel: "Get your notebook imported",
      },
    ],
  },
  {
    title: "For fashion houses",
    items: [
      {
        id: "payroll",
        icon: Banknote,
        title: "Piece-rate payroll",
        body: "Set a rate per garment or per stage. Jaylor works out what each tailor earned and prepares the weekly payroll, ready to pay.",
      },
      {
        id: "inventory",
        icon: Boxes,
        title: "Stock that adds up",
        body: "Track linings, zips, thread and buttons, with a running count for each item, so you know what is running low before a job stops for lack of one.",
      },
      {
        id: "business-report",
        icon: BarChart3,
        title: "A business report you can share",
        body: "A monthly summary of sales, collections and profit, ready to show a bank or partner, with client names hidden if you choose to share it.",
      },
      {
        id: "multi-currency",
        icon: Globe,
        title: "Clients abroad",
        body: "Price orders in pounds, dollars or cedis, with the exchange rate recorded on the order so your reports stay honest.",
      },
    ],
  },
  {
    title: "Get found",
    items: [
      {
        id: "directory",
        icon: Store,
        title: "Tailor directory",
        body: "List your shop in the Jaylor tailor directory, free on every plan. Clients search by city and style, then chat with you directly on WhatsApp.",
        linkTo: "/tailors",
        linkLabel: "Browse the directory",
      },
    ],
  },
];

function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-3xl px-4 py-14 lg:px-8 lg:py-20">
        <div className="text-center">
          <h1 className="font-heading text-4xl">Everything Jaylor does</h1>
          <p className="mt-4 text-muted-foreground">
            A closer look at the features built for how tailors and fashion houses actually work.
          </p>
        </div>

        <nav aria-label="Jump to a group" className="mt-8 flex flex-wrap justify-center gap-2">
          {GROUPS.map((group) => (
            <a
              key={group.title}
              href={`#${group.items[0]?.id}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-gold hover:text-foreground"
            >
              {group.title}
            </a>
          ))}
        </nav>

        <StitchDivider className="my-10" />

        <div className="space-y-16">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs uppercase tracking-[0.1em] text-gold">{group.title}</p>
              <div className="mt-8 space-y-10">
                {group.items.map(({ id, icon: Icon, title, body, linkTo, linkLabel }) => (
                  <section key={id} id={id} className="scroll-mt-24">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-gold">
                      <Icon className="size-6" />
                    </span>
                    <h2 className="mt-4 font-heading text-2xl">{title}</h2>
                    <p className="mt-2 text-muted-foreground">{body}</p>
                    {linkTo && linkLabel && (
                      <Button asChild variant="outline" className="mt-4">
                        <Link to={linkTo}>{linkLabel}</Link>
                      </Button>
                    )}
                  </section>
                ))}
              </div>
            </div>
          ))}
        </div>

        <StitchDivider className="my-14" />

        <div id="voice-and-photo" className="scroll-mt-24">
          <p className="text-xs uppercase tracking-[0.1em] text-gold">Less typing, more making</p>
          <h2 className="mt-4 font-heading text-3xl">Talk to Jaylor, or show it a photo.</h2>
          <div className="mt-8 space-y-10">
            {[
              {
                icon: Mic,
                title: "Speak an order",
                body: "Describe a new order out loud. Jaylor turns what you said into a draft order for you to check before anything is saved.",
              },
              {
                icon: Camera,
                title: "Scan a notebook page",
                body: "Photograph an old notebook page. Jaylor reads it into draft orders, ready for you to review and confirm, never saved automatically.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <section key={title}>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-gold">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-4 font-heading text-2xl">{title}</h3>
                <p className="mt-2 text-muted-foreground">{body}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
      <UncollectedCalculator />
    </MarketingLayout>
  );
}
