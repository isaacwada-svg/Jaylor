import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  MessageCircle,
  Notebook,
  Package,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { LogoMark } from "@/components/jaylor/logo";
import { Wordmark } from "@/components/jaylor/wordmark";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { StitchTrack } from "@/components/jaylor/stitch-track";
import { MoneyText } from "@/components/jaylor/money-text";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { PhoneMockup } from "@/components/jaylor/phone-mockup";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_LINE, ORDER_STATUSES } from "@/lib/jaylor";
import { trackEvent } from "@/lib/analytics";
import { PRICE_TIERS } from "@/lib/pricing-content";
import { UncollectedCalculator } from "@/components/jaylor/uncollected-calculator";
import { JOB_LANDING_CONTENT } from "@/lib/job-landing-content";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Jaylor — Every order tracked. Every naira collected." },
      {
        name: "description",
        content:
          "Jaylor tracks every order, measurement and payment for tailors and fashion houses, and reminds clients on WhatsApp so you get paid on time. Free to start.",
      },
      { property: "og:title", content: "Jaylor — Every order tracked. Every naira collected." },
      {
        property: "og:description",
        content:
          "Orders, measurements, payments and client reminders for tailors and fashion houses in Nigeria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const PROBLEMS = [
  {
    icon: Notebook,
    title: "Lost in a notebook",
    body: "Orders, measurements and promises scattered across pages that get torn, wet or misplaced.",
  },
  {
    icon: Wallet,
    title: "Balances that slip away",
    body: "Half-paid orders are easy to forget until a client comes back and you can't remember what they owe.",
  },
  {
    icon: Package,
    title: "Clothes nobody comes for",
    body: "Finished garments sit for weeks because there's no simple way to remind a client to collect them.",
  },
];

const FEATURES = [
  {
    icon: StitchIcon,
    title: "Track every order",
    body: "A clear status track from Received to Collected, so you and your tailors always know what's next.",
  },
  {
    icon: Wallet,
    title: "Never lose a naira",
    body: "Every payment and balance owed, always correct, always one tap away from a receipt.",
  },
  {
    icon: MessageCircle,
    title: "Message clients on WhatsApp",
    body: "Tap-to-send reminders for ready orders and balances due, pre-written and ready to go.",
  },
  {
    icon: Store,
    title: "Your own shop page",
    body: "A beautiful storefront link to share on WhatsApp and Instagram. No marketplace, just your business.",
  },
];

const HIGHLIGHTS = [
  {
    icon: CalendarClock,
    title: "Group and aso-ebi orders",
    body: "One link for the whole family or bridal party to measure and pay their own share.",
  },
  {
    icon: Sparkles,
    title: "AI that saves time",
    body: "Scan a page of your notebook, or speak an order out loud, and Jaylor drafts it for you to confirm.",
  },
];

const PLANS = PRICE_TIERS.map((plan) => ({ ...plan, features: plan.features.slice(0, 4) }));

const TESTIMONIALS = [
  {
    name: "Amaka Obi",
    shop: "Obi Bespoke",
    city: "Lagos",
    quote:
      "I used to keep three notebooks for orders, measurements and money owed. Now it's all in one place and I know exactly who owes what.",
  },
  {
    name: "Ibrahim Sule",
    shop: "Sule Tailoring House",
    city: "Kano",
    quote:
      "The WhatsApp reminders alone paid for the app. Clients pick up their clothes faster because I remember to remind them.",
  },
  {
    name: "Blessing Eze",
    shop: "Blessing Couture",
    city: "Abuja",
    quote:
      "My storefront link gets shared around so much that new clients now ask for it by name before they even call.",
  },
];

const HOME_FAQ = [
  {
    question: "Is my client data safe?",
    answer:
      "Every store's clients, orders and measurements are kept separate at the database level, not just hidden in the app's screens. Nobody at another store can read your client list, and staff only see what their role allows.",
  },
  {
    question: "Can I control what my staff can see?",
    answer:
      "Yes. Owners and managers can see prices, payments and balances. Tailors work from a view built for making clothes: orders, measurements and fitting details, without money information.",
  },
  {
    question: "What happens if I stop paying?",
    answer:
      "Your store moves to the Free plan automatically. Nothing is deleted: your clients, orders and measurement history stay exactly as they are, and you can upgrade again whenever you're ready.",
  },
  {
    question: "Do my clients need to install anything?",
    answer:
      "No. Clients receive plain WhatsApp messages and links, and can view their orders, storefront items or measurement card in a browser. Only you and your staff need a Jaylor account.",
  },
  {
    question: "Does it work offline?",
    answer:
      "Yes. You can keep taking orders and recording payments without a connection, and Jaylor syncs everything the next time you're online.",
  },
];

function Home() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void trackEvent("landing_view");
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="linen min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <Wordmark className="text-xl" />
          </Link>
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Start free
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold">
              For tailors and fashion houses in Nigeria
            </p>
            <h1 className="mt-3 text-4xl leading-tight lg:text-5xl">
              Run your shop.
              <br />
              Collect measurements and money from anyone, anywhere.
            </h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground">
              Orders, measurements and payments for tailors and fashion houses, plus one link that
              collects from a whole group or a single client who cannot come in.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free forever for small shops. No card required.
            </p>
          </div>

          <div className="relative">
            <Card className="rounded-2xl border-gold/30 shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  You are owed
                </p>
                <MoneyText amount={412500} variant="owed" className="mt-1 text-3xl" />
                <p className="mt-1 text-xs text-muted-foreground">9 clients owing</p>
                <StitchDivider className="my-4" />
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  Mama Blessing · Aso-oke gown
                </p>
                <StitchTrack
                  steps={ORDER_STATUSES}
                  currentIndex={ORDER_STATUSES.indexOf("Fitting")}
                  className="mt-4"
                />
                <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-card p-3">
                  <span className="text-sm">Collected this month</span>
                  <MoneyText amount={1285000} variant="paid" />
                </div>
              </CardContent>
            </Card>
            <div
              aria-hidden
              className="absolute -right-6 -top-6 -z-10 size-32 rounded-full bg-gold/10 blur-2xl lg:size-48"
            />
          </div>
        </div>
      </section>

      <UncollectedCalculator />

      <section className="border-t border-border/60 bg-card/40 py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">
            You know the business. Jaylor keeps track of it.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {PROBLEMS.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="rounded-2xl">
                <CardContent className="p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-gold">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">How Jaylor helps</h2>
          <StitchDivider className="mx-auto my-6 w-24" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="rounded-2xl">
                <CardContent className="p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-gold">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="rounded-2xl">
                <CardContent className="p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-gold">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/40 py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">What kind of job?</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
            Aso-ebi is the one everyone knows, but the same one link handles any job where people
            can&apos;t come to you.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {JOB_LANDING_CONTENT.map((job) => (
              <Link key={job.slug} to="/jobs/$slug" params={{ slug: job.slug }}>
                <Card className="h-full rounded-2xl transition-colors hover:bg-accent/40">
                  <CardContent className="p-4">
                    <p className="font-medium">{job.tileLabel}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 py-14 lg:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <p className="text-center text-xs uppercase tracking-[0.18em] text-gold">
            Built around the workroom
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-2xl lg:text-3xl">
            Less chasing. More making.
          </h2>
          <div className="mt-8 grid gap-6 border-y border-border/70 py-7 sm:grid-cols-3">
            <div>
              <p className="font-heading text-xl">Know what is next</p>
              <p className="mt-2 text-sm text-muted-foreground">
                See every garment move from received to collected without searching through paper.
              </p>
            </div>
            <div className="border-border sm:border-x sm:px-6">
              <p className="font-heading text-xl">Remember every balance</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Keep deposits, payments and outstanding money tied to the right order.
              </p>
            </div>
            <div>
              <p className="font-heading text-xl">Keep clients informed</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Send clear WhatsApp updates from the same place you manage the work.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">See it in your hands</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <ScreenshotCard caption="Track every order">
              <div className="space-y-1.5">
                <div className="rounded-lg border border-border/70 bg-card p-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-[10px] font-medium">Blessing Eze</p>
                    <span className="shrink-0 rounded-full bg-gold/15 px-1.5 py-0.5 text-[8px] font-medium text-gold">
                      Fitting
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                    Aso-oke gown · ORD-1042
                  </p>
                  <div className="mt-1.5 flex items-center gap-0.5">
                    {["Received", "Cutting", "Sewing", "Fitting", "Ready"].map((s, i) => (
                      <span
                        key={s}
                        className={cn("h-1 flex-1 rounded-full", i <= 3 ? "bg-gold" : "bg-border")}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-[10px] font-medium">Amaka Obi</p>
                    <span className="shrink-0 rounded-full bg-paid/15 px-1.5 py-0.5 text-[8px] font-medium text-paid">
                      Ready
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                    Ankara dress · ORD-1039
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-[10px] font-medium">Ibrahim Sule</p>
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                      Cutting
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                    Agbada set · ORD-1044
                  </p>
                </div>
              </div>
            </ScreenshotCard>
            <ScreenshotCard caption="Never lose a naira">
              <div className="space-y-1.5">
                <div className="rounded-lg border border-border/70 bg-card p-2.5">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
                    You are owed
                  </p>
                  <p className="figures mt-0.5 text-sm font-medium text-owed">₦145,000</p>
                  <p className="text-[8px] text-muted-foreground">9 clients owing</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2.5">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
                    Collected this month
                  </p>
                  <p className="figures mt-0.5 text-sm font-medium text-paid">₦850,000</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Collection score</span>
                    <span className="font-medium text-gold">82/100</span>
                  </div>
                </div>
              </div>
            </ScreenshotCard>
            <ScreenshotCard caption="Remind clients on WhatsApp">
              <div className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-gold/15 p-2 text-[9px] leading-snug">
                  Hi Blessing, your aso-oke gown is ready for pickup. Balance: ₦15,000.
                </div>
                <p className="ml-auto max-w-[85%] text-right text-[7px] text-muted-foreground">
                  Delivered ✓✓
                </p>
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-gold/15 p-2 text-[9px] leading-snug">
                  Hi Ibrahim, just a reminder that ₦20,000 is still outstanding on your order.
                </div>
              </div>
            </ScreenshotCard>
            <ScreenshotCard caption="Your own storefront">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { name: "Ankara gown", price: "₦25k–45k", tone: "from-owed/40 to-gold/40" },
                  { name: "Agbada set", price: "₦40k–60k", tone: "from-gold/40 to-paid/30" },
                  { name: "Aso-oke", price: "₦32k–50k", tone: "from-paid/30 to-owed/30" },
                  { name: "Kaftan", price: "₦18k–30k", tone: "from-gold/30 to-owed/40" },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="overflow-hidden rounded-lg border border-border/70 bg-card"
                  >
                    <div className={cn("h-8 bg-gradient-to-br", item.tone)} />
                    <div className="p-1.5">
                      <p className="truncate text-[9px] font-medium">{item.name}</p>
                      <p className="text-[8px] text-muted-foreground">{item.price}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScreenshotCard>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/40 py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">Tailors already using Jaylor</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="rounded-2xl">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4 flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback>{initials(t.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.shop} · {t.city}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-border/60 bg-card/40 py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">Simple, honest pricing</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Every new store gets 14 days of Growth free. Downgrading never deletes your data.
          </p>
          <p className="mt-2 text-center text-sm">
            <Link to="/pricing" className="text-gold underline-offset-4 hover:underline">
              See the full comparison
            </Link>
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <Card
                key={plan.tier}
                className={plan.tier === "Growth" ? "rounded-2xl border-gold" : "rounded-2xl"}
              >
                <CardContent className="flex h-full flex-col p-6">
                  <TierBadge tier={plan.tier} />
                  <p className="mt-3 text-2xl">
                    {plan.prices.monthly ? plan.prices.monthly.perMonth : "By quote"}
                  </p>
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
                    <Button
                      asChild
                      className="w-full"
                      variant={plan.mostPopular ? "default" : "outline"}
                    >
                      {plan.cta === "custom" ? (
                        <Link to="/custom">Talk to us</Link>
                      ) : (
                        <Link to="/auth" search={{ mode: "signup" }}>
                          {plan.tier === "Free" ? "Start free" : "Start 14-day trial"}
                        </Link>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="mx-auto w-full max-w-2xl px-4 lg:px-8">
          <h2 className="text-center text-2xl lg:text-3xl">Common questions</h2>
          <Accordion type="single" collapsible className="mt-8">
            {HOME_FAQ.map((item, i) => (
              <AccordionItem key={item.question} value={`home-faq-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-16 text-center lg:py-20">
        <div className="mx-auto w-full max-w-2xl px-4 lg:px-8">
          <h2 className="text-2xl lg:text-3xl">Ready to stop losing track?</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Set up your workroom in a minute. No card required to start.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/auth" search={{ mode: "signup" }}>
              Start free
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center lg:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <Wordmark className="text-lg" />
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/features" className="hover:text-foreground">
              Features
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
            <Link to="/privacy-policy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">{COMPANY_LINE}</p>
        </div>
      </footer>
    </main>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function ScreenshotCard({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div>
      <PhoneMockup>{children}</PhoneMockup>
      <p className="mt-3 text-center text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function StitchIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M4 12c4-8 12-8 16 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
    </svg>
  );
}
