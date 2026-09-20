import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { MEASUREMENT_GUIDES, MeasurementDiagram } from "@/components/jaylor/measurement-diagram";
import { StitchDivider } from "@/components/jaylor/stitch-divider";

export const Route = createFileRoute("/measure-guide")({
  head: () => ({
    meta: [
      {
        title: "How to measure yourself — Jaylor",
      },
      {
        name: "description",
        content:
          "A picture guide for taking your own body measurements at home, to send to your tailor.",
      },
    ],
  }),
  component: MeasureGuide,
});

function MeasureGuide() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-3xl px-4 py-12 lg:px-8">
        <h1 className="font-heading text-3xl sm:text-4xl">How to measure yourself at home</h1>
        <p className="mt-3 text-muted-foreground">
          Your tailor sent you this guide so you can take your own measurements and send the numbers
          back to them. Use a soft (fabric) measuring tape, wear light, fitted clothing, and have
          someone help you if you can — it makes a few of these much easier to get right.
        </p>
        <StitchDivider className="my-8" />

        <div className="grid gap-8 sm:grid-cols-2">
          {MEASUREMENT_GUIDES.map((g) => (
            <div key={g.id} className="rounded-2xl border border-border p-4">
              <MeasurementDiagram label={g.title} className="mx-auto h-48 w-auto" />
              <h2 className="mt-3 font-heading text-lg">{g.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{g.instructions}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Once you have your numbers, send them to your tailor with the unit you used (inches or cm)
          — the same way they shared this guide with you.
        </p>
      </section>
    </MarketingLayout>
  );
}
