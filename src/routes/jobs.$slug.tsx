import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { jobLandingBySlug, JOB_LANDING_CONTENT } from "@/lib/job-landing-content";

export const Route = createFileRoute("/jobs/$slug")({
  // Dynamic routes are always excluded from sitemapStaticPaths (see src/lib/sitemap.ts);
  // these pages are added explicitly as known static paths in sitemap.xml.ts instead.
  staticData: { sitemap: false },
  loader: ({ params }) => {
    const content = jobLandingBySlug(params.slug);
    if (!content) throw notFound();
    return content;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.tileLabel} — Jaylor` },
          { name: "description", content: loaderData.headline },
          { property: "og:title", content: `${loaderData.tileLabel} — Jaylor` },
          { property: "og:description", content: loaderData.headline },
        ]
      : [],
  }),
  component: JobLandingPage,
});

function JobLandingPage() {
  const content = Route.useLoaderData();
  const others = JOB_LANDING_CONTENT.filter((j) => j.slug !== content.slug).slice(0, 3);

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-3xl px-4 py-14 lg:px-8 lg:py-20">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">{content.tileLabel}</p>
        <h1 className="mt-3 text-3xl leading-tight lg:text-4xl">{content.headline}</h1>
        <p className="mt-5 text-base text-muted-foreground">{content.pain}</p>

        <StitchDivider className="my-8" />

        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          How it works with Jaylor
        </p>
        <p className="mt-2 text-base">{content.flow}</p>

        <div
          aria-hidden
          className="mt-8 flex aspect-video items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 text-sm text-muted-foreground"
        >
          Screenshot coming soon
        </div>

        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Start free
            </Link>
          </Button>
        </div>

        <StitchDivider className="my-12" />

        <p className="text-sm font-medium">Other kinds of job</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <Link key={o.slug} to="/jobs/$slug" params={{ slug: o.slug }}>
              <Card className="h-full rounded-2xl transition-colors hover:bg-accent/40">
                <CardContent className="p-4">
                  <p className="font-medium">{o.tileLabel}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
