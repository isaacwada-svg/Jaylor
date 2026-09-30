import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { Button } from "@/components/ui/button";
import { COMPANY_LINE } from "@/lib/jaylor";

export const Route = createFileRoute("/passport")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Your Measurement Passport — Jaylor" },
      {
        name: "description",
        content:
          "Get measured once. Use it with any Jaylor tailor. Your measurements belong to you.",
      },
      { property: "og:title", content: "Your Measurement Passport — Jaylor" },
      {
        property: "og:description",
        content: "Get measured once. Use it with any Jaylor tailor.",
      },
    ],
  }),
  component: PassportLanding,
});

function PassportLanding() {
  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <ShieldCheck className="mx-auto size-8 text-gold" />
          <h1 className="mt-3 font-heading text-2xl">Your Measurement Passport</h1>
          <p className="mt-3 text-muted-foreground">
            Get measured once. Use it with any Jaylor tailor. Your measurements belong to you.
          </p>

          <Button asChild className="mt-6 w-full">
            <Link to="/passport/claim">
              Claim my Passport
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <StitchDivider className="my-6" />

          <p className="text-sm text-muted-foreground">
            <Link
              to="/tailors"
              className="font-medium text-gold underline-offset-4 hover:underline"
            >
              Find a Jaylor tailor
            </Link>
          </p>

          <StitchDivider className="my-6" />

          <p className="text-sm text-muted-foreground">
            For tailors:{" "}
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="font-medium text-gold underline-offset-4 hover:underline"
            >
              join Jaylor
            </Link>
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
