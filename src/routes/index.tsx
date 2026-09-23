import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  Check,
  MessageCircle,
  Package,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { BrandLogo, LogoMark } from "@/components/jaylor/logo";
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
import measurementDetail from "@/assets/jaylor-measurement-detail.jpg";
import garmentEditorial from "@/assets/jaylor-garment-editorial.jpg";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Jaylor — The modern workroom for fashion businesses" },
      {
        name: "description",
        content:
          "Jaylor brings orders, measurements, payments and client updates into one refined workroom for tailors and fashion houses in Nigeria.",
      },
      { property: "og:title", content: "Jaylor — The modern workroom for fashion businesses" },
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

const OPERATING_SYSTEM = [
  {
    number: "01",
    icon: Package,
    title: "Every order, in its place",
    body: "Follow each garment from received to collected, with fittings, deadlines and responsibilities kept clear.",
  },
  {
    number: "02",
    icon: Wallet,
    title: "Every naira, accounted for",
    body: "Deposits, payments and outstanding balances stay connected to the right client and the right order.",
  },
  {
    number: "03",
    icon: MessageCircle,
    title: "Every client, informed",
    body: "Send considered WhatsApp updates and reminders without leaving the place where the work is managed.",
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
            <BrandLogo dark showTagline markClassName="h-14 w-auto" />
          </Link>
          <nav className="hidden items-center gap-8 text-xs uppercase text-foreground/70 md:flex">
            <a href="#workroom" className="transition-colors hover:text-gold">
              The workroom
            </a>
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
                <Link to="/dashboard">
                  <LogoMark variant="full" className="size-4" />
                  Open Jaylor
                </Link>
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

      <section className="relative min-h-[720px] border-b border-foreground/10 sm:min-h-[780px] lg:min-h-[820px]">
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

        <div className="relative mx-auto flex min-h-[720px] w-full max-w-[1440px] items-end px-5 pb-16 pt-32 sm:min-h-[780px] sm:px-8 sm:pb-20 lg:min-h-[820px] lg:items-center lg:px-12 lg:pb-0">
          <div className="editorial-rise max-w-3xl">
            <p className="text-[11px] uppercase text-gold">The modern workroom · Nigeria</p>
            <h1 className="mt-6 text-6xl leading-[0.9] text-foreground sm:text-7xl lg:text-[7.5rem]">
              Jaylor
              <span className="mt-3 block max-w-2xl text-[0.56em] italic leading-[1.02] text-foreground/95">
                The business of style, beautifully managed.
              </span>
            </h1>
            <p className="mt-8 max-w-lg text-base leading-7 text-foreground/70 sm:text-lg">
              Orders, measurements, payments and client updates—held together in one considered
              place for tailors and fashion houses.
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
              <a
                href="#workroom"
                className="border-b border-gold pb-1 text-xs uppercase text-foreground transition-colors hover:text-gold"
              >
                Enter the workroom
              </a>
            </div>
            <p className="mt-5 text-xs text-foreground/50">
              Free for small shops. No card required.
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 right-5 hidden w-64 border-t border-gold/70 py-5 lg:block lg:right-12">
          <p className="text-[10px] uppercase text-gold">Made for the craft</p>
          <p className="mt-2 text-xs leading-5 text-foreground/60">
            From first measurement to final collection.
          </p>
        </div>
      </section>

      <section id="workroom" className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs uppercase text-gold">Built around the workroom</p>
              <h2 className="mt-5 max-w-md text-5xl leading-none sm:text-6xl">
                You know the craft. Jaylor keeps its business in order.
              </h2>
            </div>
            <div className="border-t border-border">
              {OPERATING_SYSTEM.map(({ number, icon: Icon, title, body }) => (
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
            <p className="text-xs uppercase text-gold">Precision, remembered</p>
            <h2 className="mt-5 text-5xl leading-none sm:text-6xl">
              A fitting should begin with confidence.
            </h2>
            <p className="mt-7 text-base leading-7 text-muted-foreground">
              Keep each client’s measurements, garment history and fitting notes ready for the next
              visit. No searching. No second guessing.
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
              <Link to="/features">
                Explore the workroom <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
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
            <BrandLogo dark showTagline markClassName="h-20 w-auto" />
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
