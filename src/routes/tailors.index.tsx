import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { DirectoryResults } from "@/components/jaylor/directory-search";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import {
  getDirectoryListings,
  getDirectoryLocations,
  getDirectorySpecialties,
} from "@/lib/directory.functions";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/tailors/")({
  staticData: { sitemap: true },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    const [page, locations, specialties, language] = await Promise.all([
      getDirectoryListings({ data: {} }),
      getDirectoryLocations(),
      getDirectorySpecialties(),
      resolveLanguage({ data: { urlLang: deps.lang } }),
    ]);
    const resources = await loadNamespaces(language, ["common", "directory"]);
    return { page, locations, specialties, language, resources };
  },
  head: () => ({
    meta: [
      { title: "Find a Jaylor tailor" },
      {
        name: "description",
        content:
          "Browse Jaylor tailors near you. Get measured once, use your Measurement Passport with any of them.",
      },
      { property: "og:title", content: "Find a Jaylor tailor" },
      {
        property: "og:description",
        content: "Browse Jaylor tailors near you and chat with them directly on WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TailorsPage,
});

function TailorsPage() {
  const online = useOnlineStatus();
  const { page, locations, specialties, language, resources } = Route.useLoaderData();

  return (
    <I18nProvider language={language} resources={resources}>
      <TailorsPageContent
        online={online}
        page={page}
        locations={locations}
        specialties={specialties}
      />
    </I18nProvider>
  );
}

function TailorsPageContent({
  online,
  page,
  locations,
  specialties,
}: {
  online: boolean;
  page: ReturnType<typeof Route.useLoaderData>["page"];
  locations: ReturnType<typeof Route.useLoaderData>["locations"];
  specialties: ReturnType<typeof Route.useLoaderData>["specialties"];
}) {
  const t = useT("directory");
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-5xl px-4 py-12 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl sm:text-4xl">{t("page_title")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("page_description")}</p>

        {!online ? (
          <div className="mt-8">
            <OfflineNotice label={t("offline_browse")} />
          </div>
        ) : (
          <div className="mt-8">
            <DirectoryResults
              initialData={page}
              locations={locations}
              specialties={specialties}
              emptyLabel={t("empty_generic")}
            />
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}
