import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  CalendarClock,
  Camera,
  Check,
  Gauge,
  Globe,
  Package,
  Radar,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { MoneyText } from "@/components/jaylor/money-text";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Button } from "@/components/ui/button";
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
import atelierHero from "@/assets/jaylor-atelier-hero.jpg";
import dashboardProduct from "@/assets/jaylor-dashboard-product.png";
import measurementDetail from "@/assets/jaylor-measurement-detail.jpg";
import garmentEditorial from "@/assets/jaylor-garment-editorial.jpg";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Jaylor: order, payment and staff management for Nigerian tailors" },
      {
        name: "description",
        content:
          "Jaylor helps Nigerian tailors manage orders, payments, measurements and staff, with client tracking and approval built in.",
      },
      {
        property: "og:title",
        content: "Jaylor: order, payment and staff management for Nigerian tailors",
      },
      {
        property: "og:description",
        content: "Every order tracked. Every measurement kept. Every naira accounted for.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const CLIENT_FEATURES = [
  {
    number: "01",
    icon: Radar,
    title: "Track my order",
    body: "Send each client a link where they can follow their garment from cutting to ready. Fewer “is my cloth ready?” calls.",
  },
  {
    number: "02",
    icon: ShieldCheck,
    title: "Approve before cutting",
    body: "Your client sees the fabric photos, style, measurements and price, and taps Approve before you cut. If there is ever a disagreement, you have proof.",
  },
  {
    number: "03",
    icon: BadgeCheck,
    title: "On-time badge",
    body: "Show clients your real on-time delivery record, taken from your work in Jaylor, not from reviews.",
  },
];

const WORKROOM_FEATURES = [
  {
    number: "01",
    icon: Package,
    title: "Every order, in its place",
    body: "Follow each garment from received to collected, with fittings, deadlines and who is working on it.",
  },
  {
    number: "02",
    icon: Wallet,
    title: "Every naira, accounted for",
    body: "Deposits, payments and balances stay linked to the right client and order. See your profit on every job.",
  },
  {
    number: "03",
    icon: Gauge,
    title: "No more overbooking",
    body: "Jaylor warns you when a week is already full, before you promise another date. Plan December properly.",
  },
  {
    number: "04",
    icon: Camera,
    title: "Fabric on record",
    body: "Photograph the fabric your client brings. No more arguments about what was received.",
  },
];

const FASHION_HOUSE_FEATURES = [
  {
    icon: Banknote,
    title: "Piece-rate payroll",
    body: "Set a rate per garment or per stage. Jaylor works out what each tailor earned and prepares the weekly payroll.",
  },
  {
    icon: Boxes,
    title: "Stock that adds up",
    body: "Track linings, zips, thread and buttons. Know what is running low before a job stops.",
  },
  {
    icon: BarChart3,
    title: "A business report you can share",
    body: "A monthly summary of sales, collections and profit, ready to show a bank or partner.",
  },
  {
    icon: Globe,
    title: "Clients abroad",
    body: "Price orders in pounds, dollars or cedis.",
  },
];

const FEATURES = [
  {
    icon: Store,
    title: "A storefront that feels like yours",
    body: "Share a considered shop page on WhatsApp or Instagram. Your work, your name, your clients.",
  },
  {
    icon: CalendarClock,
    title: "One link for group work",
    body: "Collect measurements and payments from families, bridal parties and aso-ebi groups without the usual chasing.",
  },
  {
    icon: Sparkles,
    title: "Less typing, more making",
    body: "Speak an order or bring in an old notebook page, then review Jaylor's draft before anything is saved.",
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

const PLANS = PRICE_TIERS.map((plan) => ({ ...plan, features: plan.features.slice(0, 4) }));

function Home() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void trackEvent("landing_view");
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="premium-public min-h-screen overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-30 border-b border-foreground/10">
        <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to="/" aria-label="Jaylor home">
            <BrandLogo dark showTagline markClassName="h-11 w-auto" />
          </Link>
          <nav className="hidden items-center gap-8 text-xs uppercase text-foreground/70 md:flex">
            <Link to="/features" className="transition-colors hover:text-gold">
              Features
            </Link>
            <a href="#pricing" className="transition-colors hover:text-gold">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-4">
            {signedIn ? (
              <Button asChild variant="premium" className="rounded-none px-5 uppercase">
                <Link to="/dashboard">Open Jaylor</Link>
              </Button>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="hidden text-xs uppercase text-foreground/70 hover:text-foreground sm:block"
                >
                  Sign in
                </Link>
                <Button asChild variant="premium" className="rounded-none px-5 uppercase">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Start free
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative min-h-[600px] border-b border-foreground/10 sm:min-h-[640px] lg:min-h-[680px]">
        <img
          src={atelierHero}
          alt="A Nigerian fashion designer draping a burgundy gown in her atelier"
          width={1920}
          height={1280}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[68%_center]"
        />
        <div className="premium-hero-shade-x absolute inset-0" />
        <div className="premium-hero-shade-y absolute inset-0" />

        <div className="relative mx-auto flex min-h-[600px] w-full max-w-[1440px] items-end px-5 pb-10 pt-28 sm:min-h-[640px] sm:px-8 sm:pb-14 lg:min-h-[680px] lg:items-center lg:px-12 lg:pb-0">
          <div className="editorial-rise max-w-3xl">
            <p className="text-[11px] uppercase text-gold">
              For tailors &amp; fashion houses · Nigeria
            </p>
            <h1 className="mt-6 text-5xl leading-[0.95] text-foreground sm:text-6xl lg:text-[5.5rem]">
              Run your tailoring business without the chaos.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-foreground/70 sm:text-lg">
              Orders, measurements, payments and staff in one place. Your clients can follow their
              order and approve it before you cut. Built for Nigerian tailors and fashion houses.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Button
                asChild
                variant="premium"
                size="lg"
                className="h-12 rounded-none px-7 uppercase"
              >
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free <ArrowRight />
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-foreground/50">Free to start. No card required.</p>
            <a
              href="#workroom"
              className="mt-3 inline-block text-[11px] uppercase text-foreground/50 transition-colors hover:text-gold"
            >
              See how it works
            </a>
          </div>
        </div>
        <div className="absolute bottom-0 right-5 hidden w-64 border-t border-gold/70 py-5 lg:block lg:right-12">
          <p className="text-[10px] uppercase text-gold">Made for the craft</p>
          <p className="mt-2 text-xs leading-5 text-foreground/60">
            From first measurement to final collection.
          </p>
        </div>
      </section>

      <section
        aria-label="The Jaylor dashboard"
        className="border-b border-border bg-secondary/40 py-10 lg:py-14"
      >
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
          <p className="text-center text-[11px] uppercase text-gold">This is Jaylor</p>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-foreground/60">
            Your orders, balances and fittings, the real workroom, exactly as you will see it.
          </p>
          <img
            src={dashboardProduct}
            alt="The Jaylor dashboard showing today's orders, money owed, collection score and garments due soon"
            width={1420}
            height={1976}
            loading="eager"
            className="mt-6 h-auto w-full"
          />
        </div>
      </section>

      <section id="clients-see" className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs uppercase text-gold">What your clients see</p>
              <h2 className="mt-5 max-w-md text-5xl leading-none sm:text-6xl">
                Clients who trust you come back.
              </h2>
            </div>
            <div className="border-t border-border">
              {CLIENT_FEATURES.map(({ number, icon: Icon, title, body }) => (
                <article
                  key={number}
                  className="group grid gap-5 border-b border-border py-8 sm:grid-cols-[56px_1fr_auto] sm:items-start"
                >
                  <span className="text-xs text-gold">{number}</span>
                  <div>
                    <h3 className="text-3xl">{title}</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                  <Icon className="size-5 text-gold transition-transform duration-500 group-hover:translate-x-1" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="workroom" className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs uppercase text-gold">Built around the workroom</p>
              <h2 className="mt-5 max-w-md text-5xl leading-none sm:text-6xl">
                You know the craft. Jaylor keeps the business in order.
              </h2>
            </div>
            <div className="border-t border-border">
              {WORKROOM_FEATURES.map(({ number, icon: Icon, title, body }) => (
                <article
                  key={number}
                  className="group grid gap-5 border-b border-border py-8 sm:grid-cols-[56px_1fr_auto] sm:items-start"
                >
                  <span className="text-xs text-gold">{number}</span>
                  <div>
                    <h3 className="text-3xl">{title}</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                  <Icon className="size-5 text-gold transition-transform duration-500 group-hover:translate-x-1" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid border-b border-border lg:grid-cols-2">
        <div className="relative min-h-[460px] overflow-hidden lg:min-h-[680px]">
          <img
            src={measurementDetail}
            alt="A tailor marking a precise pattern on midnight fabric"
            width={1600}
            height={1200}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 hover:scale-[1.02]"
          />
        </div>
        <div className="flex items-center bg-card px-5 py-16 sm:px-10 lg:px-16">
          <div className="max-w-xl">
            <p className="text-xs uppercase text-gold">Measurement Passport</p>
            <h2 className="mt-5 text-5xl leading-none sm:text-6xl">
              Measured once. Ready at any Jaylor tailor.
            </h2>
            <p className="mt-7 text-base leading-7 text-muted-foreground">
              Your client&apos;s measurements belong to them. With a Jaylor Passport, they can share
              them with any Jaylor tailor in seconds, and see how their measurements have changed
              over time.
            </p>
            <div className="mt-10 grid grid-cols-2 border-y border-border py-7">
              <div className="border-r border-border pr-6">
                <p className="font-heading text-4xl text-gold">One</p>
                <p className="mt-2 text-xs uppercase text-muted-foreground">client record</p>
              </div>
              <div className="pl-6">
                <p className="font-heading text-4xl text-gold">Every</p>
                <p className="mt-2 text-xs uppercase text-muted-foreground">measurement & order</p>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="mt-10 rounded-none border-gold text-foreground hover:bg-gold hover:text-accent-foreground"
            >
              <Link to="/passport">
                Learn about the Passport <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <p className="text-xs uppercase text-gold">For fashion houses</p>
          <h2 className="mt-5 max-w-2xl text-5xl leading-none sm:text-6xl">
            Built for a workroom with staff.
          </h2>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {FASHION_HOUSE_FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="border-t border-border pt-7">
                <Icon className="size-5 text-gold" />
                <h3 className="mt-5 text-2xl leading-tight">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border px-5 py-20 text-center sm:px-8 lg:py-28">
        <p className="text-xs uppercase text-gold">Get found</p>
        <h2 className="mx-auto mt-5 max-w-2xl text-5xl leading-none sm:text-6xl">
          New clients can find you.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground">
          List your shop in the Jaylor tailor directory, free on every plan. Clients search by city
          and style, then chat with you on WhatsApp.
        </p>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="mt-9 rounded-none border-gold text-foreground hover:bg-gold hover:text-accent-foreground"
        >
          <Link to="/tailors">
            Browse tailors <ArrowRight />
          </Link>
        </Button>
      </section>

      <UncollectedCalculator />

      <section className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="order-2 grid content-start sm:grid-cols-3 lg:order-1">
              {FEATURES.map(({ icon: Icon, title, body }, index) => (
                <article
                  key={title}
                  className="border-t border-border py-7 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"
                >
                  <Icon className="size-5 text-gold" />
                  <p className="mt-8 text-[10px] text-muted-foreground">0{index + 1}</p>
                  <h3 className="mt-3 text-2xl leading-tight">{title}</h3>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs uppercase text-gold">Beyond the order book</p>
              <h2 className="mt-5 text-5xl leading-none sm:text-6xl">
                A composed business makes room for better work.
              </h2>
            </div>
          </div>
        </div>
      </section>

      <section className="grid border-b border-border lg:grid-cols-[0.8fr_1.2fr]">
        <div className="relative min-h-[620px] overflow-hidden">
          <img
            src={garmentEditorial}
            alt="A finished burgundy and ivory bespoke gown in an elegant atelier"
            width={1200}
            height={1600}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center px-5 py-16 sm:px-10 lg:px-16">
          <div className="w-full max-w-2xl">
            <p className="text-xs uppercase text-gold">One link. Many possibilities.</p>
            <h2 className="mt-5 text-5xl leading-none sm:text-6xl">
              Every kind of commission, held to the same standard.
            </h2>
            <div className="mt-10 border-t border-border">
              {JOB_LANDING_CONTENT.map((job, index) => (
                <Link
                  key={job.slug}
                  to="/jobs/$slug"
                  params={{ slug: job.slug }}
                  className="group flex items-center justify-between border-b border-border py-5"
                >
                  <span className="flex items-center gap-5">
                    <span className="text-[10px] text-gold">0{index + 1}</span>
                    <span className="font-heading text-2xl">{job.tileLabel}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-border bg-card py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-8 border-b border-border pb-12 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="text-xs uppercase text-gold">Plans for every workroom</p>
              <h2 className="mt-5 text-5xl leading-none sm:text-6xl">
                Begin free. Grow with intention.
              </h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground lg:justify-self-end">
              Every new store receives 14 days of Growth at no cost. If you return to Free, your
              records remain yours.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <article
                key={plan.tier}
                className="flex min-h-[390px] flex-col border-b border-border px-1 py-8 sm:border-r sm:px-6 lg:border-b-0 lg:first:pl-0 lg:last:border-r-0"
              >
                <TierBadge tier={plan.tier} className="w-fit rounded-none" />
                <p className="mt-7 font-heading text-3xl text-foreground">
                  {plan.prices.monthly ? plan.prices.monthly.perMonth : "By quote"}
                </p>
                <p className="mt-4 min-h-20 text-sm leading-6 text-muted-foreground">
                  {plan.blurb}
                </p>
                <ul className="mt-5 space-y-3 text-xs text-foreground/80">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={plan.mostPopular ? "premium" : "outline"}
                  className="mt-auto rounded-none"
                >
                  {plan.cta === "custom" ? (
                    <Link to="/custom">Talk to us</Link>
                  ) : (
                    <Link to="/auth" search={{ mode: "signup" }}>
                      {plan.tier === "Free" ? "Start free" : "Start trial"}
                    </Link>
                  )}
                </Button>
              </article>
            ))}
          </div>
          <div className="border-t border-border pt-7 text-right">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-xs uppercase text-gold hover:text-foreground"
            >
              Compare every plan <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:px-10">
          <div>
            <p className="text-xs uppercase text-gold">Considered answers</p>
            <h2 className="mt-5 text-5xl leading-none">Before you begin.</h2>
          </div>
          <Accordion type="single" collapsible className="border-t border-border">
            {HOME_FAQ.map((item, index) => (
              <AccordionItem
                key={item.question}
                value={`home-faq-${index}`}
                className="border-border"
              >
                <AccordionTrigger className="py-6 text-left font-heading text-2xl font-normal hover:text-gold hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-2xl pb-7 text-sm leading-6 text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="border-y border-gold/30 bg-burgundy px-5 py-20 text-center sm:px-8 lg:py-28">
        <p className="text-xs uppercase text-gold-soft">
          The next garment deserves a clear beginning
        </p>
        <h2 className="mx-auto mt-6 max-w-4xl text-5xl leading-none sm:text-7xl">
          Every order tracked. Every measurement kept. Every naira accounted for.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-foreground/70">
          Set up your workroom in a minute. No card required.
        </p>
        <Button
          asChild
          variant="premium"
          size="lg"
          className="mt-9 h-12 rounded-none px-8 uppercase"
        >
          <Link to="/auth" search={{ mode: "signup" }}>
            Start free <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="py-14">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-8 md:grid-cols-[1fr_auto] lg:px-10">
          <div>
            <BrandLogo dark showTagline markClassName="h-12 w-auto" />
            <p className="mt-5 max-w-sm text-xs leading-5 text-muted-foreground">{COMPANY_LINE}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-xs text-muted-foreground sm:grid-cols-3">
            <Link to="/features" className="hover:text-gold">
              Features
            </Link>
            <Link to="/pricing" className="hover:text-gold">
              Pricing
            </Link>
            <Link to="/about" className="hover:text-gold">
              About
            </Link>
            <Link to="/privacy-policy" className="hover:text-gold">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-gold">
              Terms
            </Link>
            <Link to="/security" className="hover:text-gold">
              Security
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
