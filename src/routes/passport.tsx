import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { Button } from "@/components/ui/button";
import { COMPANY_LINE } from "@/lib/jaylor";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/passport")({
  staticData: { sitemap: true },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    const language = await resolveLanguage({ data: { urlLang: deps.lang } });
    const resources = await loadNamespaces(language, ["common", "passport"]);
    return { language, resources };
  },
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
  component: PassportLandingRoute,
});

function PassportLandingRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <PassportLanding />
    </I18nProvider>
  );
}

function PassportLanding() {
  const t = useT("passport");
  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-between">
          <span />
          <LanguageSwitcher />
        </div>
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <ShieldCheck className="mx-auto size-8 text-gold" />
          <h1 className="mt-3 font-heading text-2xl">{t("landing_title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("landing_description")}</p>

          <Button asChild className="mt-6 w-full">
            <Link to="/passport/claim">
              {t("claim_button")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <StitchDivider className="my-6" />

          <p className="text-sm text-muted-foreground">
            <Link
              to="/tailors"
              className="font-medium text-gold underline-offset-4 hover:underline"
            >
              {t("find_tailor_link")}
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
              {t("join_jaylor")}
            </Link>
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
