import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Share,
  SquarePlus,
  Wifi,
  Zap,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Smartphone,
} from "lucide-react";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { PhoneMockup, MockBar, MockCard } from "@/components/jaylor/phone-mockup";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  detectPlatform,
  getInstallPromptEvent,
  isStandalone,
  subscribeInstallPrompt,
  triggerInstallPrompt,
  type DevicePlatform,
} from "@/lib/install-prompt";

export const Route = createFileRoute("/app")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Get the Jaylor app" },
      {
        name: "description",
        content:
          "Install Jaylor on your phone's home screen — iPhone or Android, no App Store or Play Store needed. Works offline, opens instantly, and stays signed in.",
      },
      { property: "og:title", content: "Get the Jaylor app" },
      {
        property: "og:description",
        content: "One tap to put Jaylor on your home screen. No app store required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GetTheApp,
});

const FEATURES = [
  {
    icon: Zap,
    title: "Opens instantly",
    body: "Launches straight from your home screen, full-screen, with no browser bars in the way.",
  },
  {
    icon: Wifi,
    title: "Works offline",
    body: "Keep reading past orders and client details even with no signal — new changes sync once you're back online.",
  },
  {
    icon: ShieldCheck,
    title: "Same secure sign-in",
    body: "No new account or password. It's the exact app you already use, just faster to open.",
  },
  {
    icon: RefreshCw,
    title: "Always up to date",
    body: "No updates to download — every improvement is there the next time you open it.",
  },
];

function GetTheApp() {
  const [platform, setPlatform] = useState<DevicePlatform>("android");
  const [installEvent, setInstallEvent] = useState(() => getInstallPromptEvent());
  const [installed, setInstalled] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const detected = detectPlatform();
    if (detected !== "other") setPlatform(detected);
    setInstalled(isStandalone());
    return subscribeInstallPrompt(setInstallEvent);
  }, []);

  async function handleInstall() {
    const outcome = await triggerInstallPrompt();
    if (outcome === "accepted") setJustInstalled(true);
  }

  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <div className="premium-hero-shade-x absolute inset-0" />
        <div className="premium-hero-shade-y absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <Smartphone className="size-3.5" />
              No App Store or Play Store needed
            </span>
            <h1 className="mt-5 font-heading text-4xl leading-tight lg:text-5xl">
              Jaylor, right on your home screen
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">
              Install Jaylor like any other app — one tap, no download, no waiting on a store
              review. It opens full-screen, works offline, and it's the exact same app you already
              trust.
            </p>
          </div>
          <figure className="relative mx-auto w-full max-w-xs">
            <PhoneMockup className="shadow-xl">
              <MockCard>
                <MockBar width="55%" tone="gold" />
                <MockBar width="80%" />
              </MockCard>
              <MockCard>
                <MockBar width="40%" tone="paid" />
                <MockBar width="90%" />
                <MockBar width="60%" />
              </MockCard>
              <MockCard>
                <MockBar width="45%" tone="owed" />
                <MockBar width="70%" />
              </MockCard>
            </PhoneMockup>
          </figure>
        </div>
      </section>

      <StitchDivider />

      <section className="mx-auto w-full max-w-3xl px-5 py-14 lg:px-10">
        <div className="text-center">
          <h2 className="font-heading text-2xl lg:text-3xl">Choose your phone to get started</h2>
          <p className="mt-2 text-muted-foreground">Installing takes less than a minute.</p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-card p-1">
            {(
              [
                { value: "ios" as const, label: "iPhone / iPad" },
                { value: "android" as const, label: "Android" },
              ] satisfies { value: DevicePlatform; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPlatform(opt.value)}
                className={cn(
                  "touch-target rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  platform === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Card className="mt-8 rounded-2xl">
          <CardContent className="p-6 lg:p-8">
            {installed ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="size-10 text-paid" />
                <p className="font-medium">Jaylor is already installed on this device</p>
                <Button asChild className="mt-2">
                  <Link to="/dashboard">Open Jaylor</Link>
                </Button>
              </div>
            ) : justInstalled ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="size-10 text-paid" />
                <p className="font-medium">Installed. Look for Jaylor on your home screen.</p>
              </div>
            ) : platform === "android" ? (
              <AndroidSteps canInstall={!!installEvent} onInstall={handleInstall} />
            ) : (
              <IosSteps />
            )}
          </CardContent>
        </Card>
      </section>

      <StitchDivider />

      <section className="mx-auto w-full max-w-5xl px-5 py-14 lg:px-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-border bg-card p-5">
              <feature.icon className="size-6 text-gold" />
              <p className="mt-3 font-medium">{feature.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-5 py-14 text-center lg:px-10">
        <p className="text-muted-foreground">Don't have a Jaylor account yet?</p>
        <Button asChild size="lg" className="mt-4">
          <Link to="/auth" search={{ mode: "signup" }}>
            Start your free trial
          </Link>
        </Button>
      </section>
    </MarketingLayout>
  );
}

function AndroidSteps({ canInstall, onInstall }: { canInstall: boolean; onInstall: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {canInstall ? (
        <>
          <p className="text-muted-foreground">
            Your browser can install Jaylor directly — no extra steps.
          </p>
          <Button size="lg" onClick={onInstall}>
            <Download className="size-4" />
            Install Jaylor
          </Button>
        </>
      ) : (
        <div className="w-full space-y-4 text-left">
          <p className="text-center text-muted-foreground">
            Open this page in Chrome, then follow these steps:
          </p>
          <Step
            number={1}
            title="Open the browser menu"
            body="Tap the ⋮ (three dots) in the top-right corner."
          />
          <Step
            number={2}
            title='Tap "Install app" or "Add to Home screen"'
            body="Chrome shows one of these depending on your version."
          />
          <Step number={3} title="Confirm" body='Tap "Install" on the prompt that appears.' />
        </div>
      )}
    </div>
  );
}

function IosSteps() {
  return (
    <div className="w-full space-y-4 text-left">
      <p className="text-center text-muted-foreground">
        This only works in Safari — not Chrome or another browser on iPhone/iPad.
      </p>
      <Step
        number={1}
        icon={Share}
        title="Tap the Share icon"
        body="It's in Safari's toolbar — a square with an arrow pointing up."
      />
      <Step
        number={2}
        icon={SquarePlus}
        title='Scroll down and tap "Add to Home Screen"'
        body="You may need to scroll the share sheet to find it."
      />
      <Step
        number={3}
        title='Tap "Add"'
        body="Jaylor's icon appears on your home screen, ready to open."
      />
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  body,
}: {
  number: number;
  icon?: typeof Share;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-gold">
        {number}
      </span>
      <div>
        <p className="flex items-center gap-1.5 font-medium">
          {Icon && <Icon className="size-4 text-gold" />}
          {title}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
