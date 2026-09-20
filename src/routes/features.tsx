import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, QrCode, Wallet, WifiOff, Package } from "lucide-react";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/features")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Features — Jaylor" },
      {
        name: "description",
        content:
          "Jaylor Pay, the Measurement Passport, group and aso-ebi events, offline mode and the notebook import service, explained.",
      },
      { property: "og:title", content: "Features — Jaylor" },
      {
        property: "og:description",
        content: "Everything Jaylor does for tailors and fashion houses, in one place.",
      },
    ],
  }),
  component: FeaturesPage,
});

const SECTIONS = [
  {
    id: "jaylor-pay",
    icon: Wallet,
    title: "Jaylor Pay",
    body: "Send a client a secure payment link for card, bank transfer or USSD. Money settles straight to your own bank account: Jaylor never holds it, and takes a small fee automatically based on your plan.",
    linkTo: "/pricing",
    linkLabel: "See Jaylor Pay fees",
  },
  {
    id: "measurement-passport",
    icon: QrCode,
    title: "Measurement Passport",
    body: "Give every client a private card of their own measurements, with a link and QR code they own. They can share it with any other Jaylor shop in one tap, so a returning client never has to be measured from scratch again.",
    linkTo: "/measurement-passport",
    linkLabel: "Learn more",
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
    body: "Keep taking orders and recording payments even without a connection. Jaylor saves your work on your device and syncs everything the next time you're online, so a bad network day never stops the workroom.",
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

        <nav aria-label="Jump to a feature" className="mt-8 flex flex-wrap justify-center gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-gold hover:text-foreground"
            >
              {s.title}
            </a>
          ))}
        </nav>

        <StitchDivider className="my-10" />

        <div className="space-y-14">
          {SECTIONS.map(({ id, icon: Icon, title, body, linkTo, linkLabel }) => (
            <section key={id} id={id} className="scroll-mt-24">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-gold">
                <Icon className="size-6" />
              </span>
              <h2 className="mt-4 font-heading text-2xl">{title}</h2>
              <p className="mt-2 text-muted-foreground">{body}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link to={linkTo}>{linkLabel}</Link>
              </Button>
            </section>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
