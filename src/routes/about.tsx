import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/jaylor";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Jaylor" },
      {
        name: "description",
        content:
          "Jaylor is a product of Bethjay Global Enterprise Limited, based in Abuja, Nigeria.",
      },
      { property: "og:title", content: "About Jaylor" },
      {
        property: "og:description",
        content: "Meet the Nigerian company building Jaylor for tailors and fashion houses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-2xl px-4 py-14 text-center lg:px-8 lg:py-20">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Abuja, Nigeria</p>
        <h1 className="mt-3 font-heading text-4xl">About Jaylor</h1>
        <p className="mt-5 text-muted-foreground">
          Jaylor is a product of Bethjay Global Enterprise Limited, RC 3283706, based in FCT Abuja,
          Nigeria. We build calm, premium business tools for tailors and fashion houses across
          Nigeria — and, over time, Ghana, Kenya and wider Africa.
        </p>
        <p className="mt-4 text-muted-foreground">
          Our promise is simple: every order tracked, every naira collected. No notebook pages that
          tear, no forgotten balances, no clothes that sit uncollected because nobody remembered to
          send a reminder.
        </p>

        <StitchDivider className="my-10" />

        <h2 className="text-xl">Get in touch</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          For support, billing questions or anything else, reach us on WhatsApp at{" "}
          <a className="font-medium text-foreground" href="https://wa.me/2349028101389">
            {SUPPORT_PHONE}
          </a>{" "}
          or by email at{" "}
          <a className="font-medium text-foreground" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </MarketingLayout>
  );
}
