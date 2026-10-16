import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardCheck,
  Link2,
  Lock,
  ShieldCheck,
  MessageCircle,
  Package,
  Search,
  Store,
  Users,
  Wallet,
  Ruler,
} from "lucide-react";
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
import { COMPANY_LINE, SHOW_DIRECTORY_IN_NAV, SUPPORT_WHATSAPP_URL } from "@/lib/jaylor";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { PRICE_TIERS, PRICING_GUARANTEE } from "@/lib/pricing-content";
import { OrderWalkthrough } from "@/components/jaylor/order-walkthrough";
import { SupportLink } from "@/components/jaylor/support-link";
import { SocialLinks } from "@/components/jaylor/social-links";
import atelierHero from "@/assets/jaylor-atelier-hero.jpg";
import measurementDetail from "@/assets/jaylor-measurement-detail.jpg";
import tailorVideo from "@/assets/videos/jaylor-story.mp4.asset.json";
import heroDemo from "@/assets/videos/jaylor-merged-promo.mp4.asset.json";
import clipNotebook from "@/assets/videos/jaylor-clip-notebook.mp4.asset.json";
import clipSpeakSnap from "@/assets/videos/jaylor-clip-speak-snap.mp4.asset.json";
import clipTracking from "@/assets/videos/jaylor-clip-tracking.mp4.asset.json";

const CLIPS = [
  { title: "Notebook vs Jaylor", url: clipNotebook.url, label: "Paper notebook problems next to the Jaylor dashboard showing money owed in naira" },
  { title: "Speak or snap an order", url: clipSpeakSnap.url, label: "Creating a Jaylor order by voice note or fabric photo" },
  { title: "Customer tracking link", url: clipTracking.url, label: "A client opens a Jaylor tracking link and sees order progress and balance" },
];
import { WhatsAppConcierge } from "@/components/jaylor/whatsapp-concierge";
import { X } from "lucide-react";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Jaylor: order, payment and staff management for Nigerian tailors" },
      {
        name: "description",
        content:
          "Jaylor is the AI-powered app for Nigerian tailors and fashion houses. Track orders, save measurements, collect every naira and get your own storefront. Free to start.",
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
  {
    number: "01",
    icon: Package,
    title: "Keep every order on track",
    body: "Keep fabric photos, garment details, deadlines and progress together. Share a tracking link so your client knows where their order stands.",
  },
  {
    number: "02",
    icon: Ruler,
    title: "Keep measurements close",
    body: "Save each client’s measurements with their history. Find the right record for a new garment instead of searching through old notebooks.",
  },
  {
    number: "03",
    icon: Wallet,
    title: "Know what is paid and owed",
    body: "Record deposits and payments against each order. See the balance still to collect, without adding it up by hand.",
  },
];

const DIFFERENTIATORS = [
  {
    icon: ClipboardCheck,
    title: "Approval before cutting",
    body: "Clients approve the style, fabric photos, measurements and price before you cut, so you have proof.",
  },
  {
    icon: Link2,
    title: "Customer tracking link",
    body: "Each client follows their order from received to ready, so you get fewer “is my cloth ready?” calls.",
  },
  {
    icon: Users,
    title: "Group orders",
    body: "Aso-ebi, weddings and family orders in one link, with each person's measurements and payments.",
  },
  {
    icon: Store,
    title: "Your own storefront",
    body: "A shop page with your logo to share on WhatsApp and Instagram.",
  },
  {
    icon: Search,
    title: "Free directory listing",
    body: "New clients can find you by city and style in the Jaylor tailor directory.",
  },
  {
    icon: Building2,
    title: "For fashion houses",
    body: "Staff roles, piece-rate payroll, stock alerts and a monthly business report.",
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
  {
    question: "What if I lose my phone?",
    answer: "Your records are safe online. Sign in on any phone or computer and everything is there.",
  },
  {
    question: "Can my apprentice steal my customers?",
    answer: "You control what each staff member sees. Tailors can work on orders without seeing prices or payments.",
  },
  {
    question: "I have measurements in a notebook. Can I bring them in?",
    answer: "Yes. Snap a photo of the notebook page, and Jaylor drafts it for you to check before saving.",
  },
  {
    question: "Does it work for aso-ebi?",
    answer: "Yes. One link for the whole group, with each person's measurements and who has paid.",
  },
];

const WOWS = [
  {
    icon: Link2,
    title: "Customer tracking link",
    body: "Clients check their order themselves. Fewer “is my cloth ready?” calls.",
  },
  {
    icon: ClipboardCheck,
    title: "Approval before cutting",
    body: "Clients approve style, fabric and price first, so you have proof.",
  },
  {
    icon: Ruler,
    title: "Measurement Passport",
    body: "A measurement record your clients keep and share.",
  },
];

function Home() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void trackEvent("landing_view");
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="premium-public jaylor-home min-h-screen overflow-hidden bg-background">
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
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {signedIn === null ? (
              <div className="h-10 w-28 sm:w-36" aria-hidden="true" />
            ) : signedIn ? (
              <Button
                asChild
                variant="premium"
                className="rounded-full px-6 uppercase tracking-[0.14em]"
              >
                <Link to="/dashboard">Open Jaylor</Link>
              </Button>
            ) : (
              <>
                <Link to="/auth" className="py-2 text-sm text-foreground/90 hover:text-foreground">
                  Sign in
                </Link>
                <Button
                  asChild
                  variant="premium"
                  className="rounded-full px-5 uppercase tracking-[0.14em] sm:px-6"
                >
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
              Every order tracked. Every measurement kept. Every naira accounted for.
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
                className="h-12 rounded-full px-9 uppercase tracking-[0.14em]"
              >
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free <ArrowRight />
                </Link>
              </Button>
              <SupportLink className="h-12 rounded-full px-7" />
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/90">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-gold" aria-hidden="true" /> Secure payments by
                Paystack
              </span>
              <span>· Cancel anytime</span>
              <span>· Your records stay yours</span>
            </p>
            <p className="mt-3 text-sm text-foreground/90">
              Trusted by <span className="font-semibold text-gold">BeeZik Fashion Hub</span> in
              Suleja
            </p>
            <a
              href="#pricing"
              className="mt-7 block max-w-xl rounded-2xl border border-gold bg-gold/15 px-5 py-4 transition-colors hover:bg-gold/25"
            >
              <span className="block font-heading text-xl text-gold">
                Free forever for solo tailors
              </span>
              <span className="mt-1 block text-sm text-foreground/90">
                1 shop · 30 days of Growth free, no card · paid plans from ₦6,000/month ·{" "}
                <span className="underline underline-offset-4">See prices</span>
              </span>
            </a>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-3.5 shrink-0 text-gold" aria-hidden="true" />
              Your records are encrypted and stay yours —{" "}
              <Link
                to="/security"
                className="text-foreground underline underline-offset-4 hover:text-gold"
              >
                see how we protect your data
              </Link>
              .
            </p>
            <a
              href="#how-it-works"
              className="mt-4 inline-block py-2 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-gold"
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

      <section aria-label="See Jaylor work" className="border-b border-border py-10 lg:py-14">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <figure id="hero-demo-video" className="relative mx-auto w-full max-w-xs">
            <span className="absolute -right-3 -top-3 z-10 rounded-full bg-gold px-4 py-1 text-xs font-semibold text-primary-foreground">
              EST. 2026
            </span>
            <video
              src={heroDemo.url}
              autoPlay
              muted
              loop
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full rounded-2xl border border-gold/20 object-cover shadow-2xl"
              aria-label="A tailor snaps fabric into Jaylor and her customer checks the order on their phone"
            />
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">
              See how Jaylor works, using real Jaylor screens.
            </figcaption>
          </figure>
          <div>
            <p className="text-xs uppercase text-gold">The three things tailors love</p>
            <ul className="mt-6 space-y-7">
              {WOWS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold/40">
                    <Icon className="size-6 text-gold" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-heading text-2xl">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <a href={tailorVideo.url} target="_blank" rel="noopener noreferrer" className="mt-7 inline-block text-sm underline underline-offset-4 hover:text-gold">
              Watch the 45-second story
            </a>
          </div>
        </div>
      </section>

      <section aria-label="Jaylor in three short clips" className="border-b border-border py-10 lg:py-14">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p className="text-center text-xs uppercase text-gold">Watch each feature</p>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            {CLIPS.map((c) => (
              <figure key={c.title} className="mx-auto w-full max-w-[16rem]">
                <video
                  src={c.url}
                  autoPlay
                  muted
                  loop
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] w-full rounded-2xl border border-gold/20 object-cover shadow-2xl"
                  aria-label={c.label}
                />
                <figcaption className="mt-3 text-center">
                  <span className="block font-heading text-lg">{c.title}</span>
                  <span className="text-xs text-muted-foreground">Real Jaylor screens, sample order</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>


      <section aria-label="Same talent, different business" className="border-b border-border py-10 lg:py-14">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 ">
          <div>
            <h2 className="text-4xl leading-tight sm:text-5xl">Same talent. Different business.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              No more searching notebooks, “I didn't ask for this style” or “who has not paid?”.
              Every order tracked, every naira safe, and approval before you cut.
            </p>
            <p className="mt-5 inline-block rounded-full bg-gold px-5 py-2 text-sm font-semibold text-primary-foreground">
              30 days of Growth free. No card.
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
                    <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                      {body}
                    </p>
                  </div>
                  <Icon className="size-5 text-gold transition-transform duration-500 group-hover:translate-x-1" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Notebook versus Jaylor" className="border-b border-border py-12 lg:py-16">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10">
          <p className="text-xs uppercase text-gold">Same talent. Different business.</p>
          <h2 className="mt-5 max-w-xl text-4xl leading-tight sm:text-5xl">Notebook vs Jaylor</h2>
          <div className="mt-10 grid gap-8 ">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="text-sm font-semibold text-destructive">Notebook</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {["Orders get lost", "Payments forgotten", "No proof of what was agreed"].map((t) => (
                    <li key={t} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{t}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-gold">Jaylor</p>
                <ul className="mt-3 space-y-2 text-sm text-foreground/90">
                  {["Every order tracked", "Every naira accounted for", "A tracking link for each customer"].map((t) => (
                    <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Who Jaylor is for" className="border-b border-border py-12 lg:py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 sm:px-8 md:grid-cols-2 lg:px-10">
          <article className="rounded-2xl border border-gold/40 bg-card p-7">
            <p className="text-xs uppercase text-gold">For solo tailors</p>
            <h3 className="mt-3 text-2xl">Know who owes you. Stop searching notebooks.</h3>
            <ul className="mt-5 space-y-2 text-sm text-foreground/90">
              {["Save every customer's measurements", "See who has paid and who owes", "Send customers a link to check their cloth", "Free forever for one shop"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-border bg-card p-7">
            <p className="text-xs uppercase text-gold">For fashion houses</p>
            <h3 className="mt-3 text-2xl">Run your team, stock and money in one place.</h3>
            <ul className="mt-5 space-y-2 text-sm text-foreground/90">
              {["Staff roles: tailors don't see money", "Pay staff per piece they sew", "Alerts before fabric runs out", "A monthly business report"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section aria-label="Storefront and directory" className="border-b border-border bg-card py-12 lg:py-16">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <p className="text-xs uppercase text-gold">Get found by new clients</p>
            <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">Your own shop page, free.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Most tailors don't have a website. Jaylor gives you a shop page with your logo and
              styles to share on WhatsApp and Instagram, plus a free listing so new clients can find
              you by city and style.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild variant="premium" className="h-12 rounded-full px-8">
                <Link to="/auth" search={{ mode: "signup" }}>Create my shop page</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-full px-8">
                <Link to="/tailors">See the directory</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-6">
              <Store className="size-6 text-gold" aria-hidden="true" />
              <p className="mt-3 font-medium">Storefront</p>
              <p className="mt-1 text-sm text-muted-foreground">One link with your logo, styles and prices.</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-6">
              <Search className="size-6 text-gold" aria-hidden="true" />
              <p className="mt-3 font-medium">Tailor directory</p>
              <p className="mt-1 text-sm text-muted-foreground">Clients search by city and style.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="More tools" className="border-b border-border py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <p className="max-w-2xl text-base text-muted-foreground">
            Speak an order or photograph a notebook page, then check the draft before anything is
            saved. Plus a calculator for balances you may still be owed.
          </p>
          <Button asChild variant="outline" className="rounded-full px-7">
            <Link to="/features" hash="voice-and-photo">
              See all features <ArrowRight />
            </Link>
          </Button>
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
              A Measurement Passport is a client’s saved measurement record. They choose when to
              share it with another Jaylor tailor and can see their measurement history in one
              place.
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="mt-10 h-12 rounded-full border-gold px-8 text-foreground hover:bg-gold hover:text-accent-foreground"
            >
              <Link to="/passport">
                Learn about the Passport <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-label="A note from the team" className="py-14 lg:py-16">
        <div className="mx-auto w-full max-w-2xl px-5 text-center sm:px-8 lg:px-10">
          <div className="border border-gold/40 bg-secondary/40 px-6 py-10 sm:px-10">
            <p className="text-xs uppercase text-gold">
              Built in Abuja, for tailors across Nigeria
            </p>
            <p className="mx-auto mt-6 max-w-md text-lg leading-8 text-foreground/90">
              "We built Jaylor after watching talented tailors lose money and sleep to lost
              notebooks, unpaid balances and endless 'is my cloth ready?' calls. We are now
              welcoming our first tailors, and I will personally help you set up your shop and add
              your first customers."
            </p>
            <p className="mt-6 text-sm text-muted-foreground">Isaac, Jaylor team</p>
            <Button
              asChild
              variant="premium"
              size="lg"
              className="mt-4 h-12 rounded-full px-8 tracking-wide"
            >
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" /> Chat with me on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>

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
              Every new store gets 30 days of the full Growth plan free. No card required. If you
              return to Free, your records remain yours.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            {PRICE_TIERS.map((plan) => (
              <article
                key={plan.tier}
                className="relative flex min-h-[390px] flex-col border-b border-border px-1 py-8 sm:border-r sm:px-6 lg:border-b-0 lg:first:pl-0 lg:last:border-r-0"
              >
                {plan.mostPopular && (
                  <span className="absolute -top-3 left-1 rounded-full bg-gold px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most popular
                  </span>
                )}
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
                <div className="mt-auto pt-12">
                  <Button
                    asChild
                    variant={plan.mostPopular ? "premium" : "outline"}
                    className={cn("min-h-12 w-full rounded-full px-4 py-3", !plan.mostPopular && "border-2")}
                  >
                    {plan.cta === "custom" ? (
                      <Link to="/custom">Talk to us</Link>
                    ) : (
                      <Link to="/auth" search={{ mode: "signup" }}>
                        {plan.tier === "Free" ? "Start free" : "Start 30-day free trial"}
                      </Link>
                    )}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">{PRICING_GUARANTEE}</p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            On the way: automatic WhatsApp reminders for fittings and pickups.
          </p>
          <div className="mt-3 border-t border-border pt-7 text-right">
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
            <p className="text-xs uppercase text-gold">Frequently asked questions</p>
            <h2 className="mt-5 text-5xl leading-none">Before you begin.</h2>
          </div>
          <Accordion type="single" collapsible className="border-t border-border">
            {HOME_FAQ.map((item, index) => (
              <AccordionItem
                key={item.question}
                value={`home-faq-${index}`}
                className="border-border"
              >
                <AccordionTrigger className="py-7 text-left font-heading text-2xl font-normal hover:text-gold hover:no-underline">
                  <span className="flex items-center gap-2.5">
                    {item.question.includes("data safe") && (
                      <Lock className="size-4 shrink-0 text-gold" aria-hidden="true" />
                    )}
                    {item.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="max-w-2xl pb-8 text-base leading-7 text-muted-foreground">
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
          Your next order deserves a system, not a notebook.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-foreground/90">
          Start with the Free plan. No card required.
        </p>
        <Button
          asChild
          variant="premium"
          size="lg"
          className="mt-9 h-12 rounded-full px-10 uppercase tracking-[0.14em]"
        >
          <Link to="/auth" search={{ mode: "signup" }}>
            Start free <ArrowRight />
          </Link>
        </Button>
        <div className="mt-5">
          <SupportLink className="h-12 max-w-full rounded-full px-6" />
        </div>
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
                <Link to="/contact" className="hover:text-gold">
                  Contact & support
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
      <WhatsAppConcierge />
    </main>
  );
}
