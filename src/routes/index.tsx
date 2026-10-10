import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Package, Wallet, Ruler } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { TierBadge } from "@/components/jaylor/tier-badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_LINE, SHOW_DIRECTORY_IN_NAV } from "@/lib/jaylor";
import { trackEvent } from "@/lib/analytics";
import { PRICE_TIERS } from "@/lib/pricing-content";
import { UncollectedCalculator } from "@/components/jaylor/uncollected-calculator";
import { OrderWalkthrough } from "@/components/jaylor/order-walkthrough";
import { SupportLink } from "@/components/jaylor/support-link";
import { SocialLinks } from "@/components/jaylor/social-links";
import atelierHero from "@/assets/jaylor-atelier-hero.jpg";
import dashboardProduct from "@/assets/jaylor-dashboard-product.png";
import measurementDetail from "@/assets/jaylor-measurement-detail.jpg";

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

const WORKROOM_FEATURES = [
  { number: "01", icon: Package, title: "Keep every order on track", body: "Keep fabric photos, garment details, deadlines and progress together. Share a tracking link so your client knows where their order stands." },
  { number: "02", icon: Ruler, title: "Keep measurements close", body: "Save each client’s measurements with their history. Find the right record for a new garment instead of searching through old notebooks." },
  { number: "03", icon: Wallet, title: "Know what is paid and owed", body: "Record deposits and payments against each order. See the balance still to collect, without adding it up by hand." },
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
          <nav className="hidden items-center gap-6 text-sm text-foreground/90 md:flex">
            <Link to="/features" className="transition-colors hover:text-gold">
              Features
            </Link>
            <a href="#pricing" className="transition-colors hover:text-gold">
              Pricing
            </a>
            <Link to="/passport" className="transition-colors hover:text-gold">
              Passport
            </Link>
            {SHOW_DIRECTORY_IN_NAV && (
              <Link to="/tailors" className="transition-colors hover:text-gold">
                Find a tailor
              </Link>
            )}
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
                  className="hidden text-sm text-foreground/90 hover:text-foreground sm:block"
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

      <section className="relative border-b border-foreground/10">
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

        <div className="relative mx-auto flex w-full max-w-[1440px] items-center px-5 pb-10 pt-28 sm:px-8 sm:pb-12 lg:px-12 lg:pt-32">
          <div className="editorial-rise max-w-3xl">
            <p className="text-sm uppercase text-gold">
              For tailors &amp; fashion houses · Nigeria
            </p>
            <h1 className="mt-6 text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Jaylor for your tailoring business.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-foreground/90 sm:text-lg">
              Orders, measurements and payments in one place. Less notebook searching, fewer balance
              mix-ups, and a clear record from first measurement to collection.
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
              <SupportLink className="h-12 rounded-none px-5" />
            </div>
            <p className="mt-5 text-xs text-muted-foreground">Free to start. No card required.</p>
            <a
              href="#how-it-works"
              className="mt-3 inline-block py-2 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-gold"
            >
              See how it works
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you a client?{" "}
              <Link to="/passport" className="underline underline-offset-2 hover:text-gold">
                Your shareable measurement record
              </Link>
            </p>
          </div>
        </div>
      </section>

      <OrderWalkthrough />

      <section id="workroom" className="border-b border-border py-12 lg:py-16">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs uppercase text-gold">The essentials, together</p>
              <h2 className="mt-5 max-w-md text-4xl leading-tight sm:text-5xl">
                Orders. Measurements. Payments.
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
                    <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">{body}</p>
                  </div>
                  <Icon className="size-5 text-gold transition-transform duration-500 group-hover:translate-x-1" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Inside Jaylor" className="border-b border-border bg-secondary/40 py-12">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 sm:px-8 md:grid-cols-2">
          <div>
            <p className="text-sm uppercase text-gold">Inside Jaylor</p>
            <h2 className="mt-4 text-4xl leading-tight">Your workroom at a glance.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">Orders due, fittings and outstanding balances, together in your workroom.</p>
            <p className="mt-3 text-sm text-muted-foreground">Product screenshot with sample figures, not customer results.</p>
            <Button asChild variant="outline" className="mt-6 rounded-none"><Link to="/features">Explore all features <ArrowRight /></Link></Button>
          </div>
          <img src={dashboardProduct} alt="Jaylor workroom screenshot with sample orders, balances and fittings" width={1420} height={1976} loading="lazy" className="mx-auto h-auto w-full max-w-80" />
        </div>
      </section>

      <section className="grid border-b border-border lg:grid-cols-2">
        <div className="relative min-h-[260px] overflow-hidden lg:min-h-[400px]">
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
            <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">
              A shareable record of your client’s measurements.
            </h2>
            <p className="mt-7 text-base leading-7 text-muted-foreground">
              A Measurement Passport is a client’s saved measurement record. They choose when to share
              it with another Jaylor tailor and can see their measurement history in one place.
            </p>
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

      <UncollectedCalculator />

      <section id="pricing" className="border-b border-border bg-card py-12 lg:py-16">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-8 border-b border-border pb-12 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="text-xs uppercase text-gold">Plans for every workroom</p>
              <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">
                Begin free. Grow with intention.
              </h2>
            </div>
            <p className="max-w-lg text-base leading-7 text-muted-foreground lg:justify-self-end">
              Every new store receives 14 days of Growth at no cost. If you return to Free, your
              records remain yours.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            {PRICE_TIERS.map((plan) => (
              <article
                key={plan.tier}
                className="flex min-h-[390px] flex-col border-b border-border px-1 py-8 sm:border-r sm:px-6 lg:border-b-0 lg:first:pl-0 lg:last:border-r-0"
              >
                <TierBadge tier={plan.tier} className="w-fit rounded-none" />
                <p className="mt-7 font-heading text-3xl text-foreground">
                  {plan.prices.monthly ? plan.prices.monthly.perMonth : "By quote"}
                </p>
                <p className="mt-4 min-h-20 text-base leading-7 text-muted-foreground">
                  {plan.blurb}
                </p>
                <ul className="mt-5 space-y-3 text-sm text-foreground/90">
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

      <section className="py-12 lg:py-16">
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
                <AccordionContent className="max-w-2xl pb-7 text-base leading-7 text-muted-foreground">
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
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-foreground/90">
          Start with the Free plan. No card required.
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
        <div className="mt-5"><SupportLink className="h-12 max-w-full rounded-none px-4" /></div>
      </section>

      <footer className="py-14">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-10 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">For clients</p>
              <nav className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
                <Link to="/passport" className="hover:text-gold">
                  Measurement Passport
                </Link>
                <Link to="/tailors" className="hover:text-gold">
                  Find a tailor
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">For tailors</p>
              <nav className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
                <Link to="/features" className="hover:text-gold">
                  Features
                </Link>
                <Link to="/pricing" className="hover:text-gold">
                  Pricing
                </Link>
                <Link to="/auth" search={{ mode: "signup" }} className="hover:text-gold">
                  Start free
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Company</p>
              <nav className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
                <Link to="/contact" className="hover:text-gold">Contact & support</Link>
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
          </div>
          <div className="mt-10 border-t border-foreground/10 pt-8">
            <BrandLogo dark showTagline markClassName="h-12 w-auto" />
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">{COMPANY_LINE}</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <p className="text-xs uppercase text-muted-foreground">Follow Jaylor</p>
              <SocialLinks showHandles className="flex flex-wrap items-center gap-6" />
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
