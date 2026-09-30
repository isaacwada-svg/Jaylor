import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { DirectoryResults } from "@/components/jaylor/directory-search";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { resolveLocationSlug } from "@/lib/directory";
import {
  getDirectoryListings,
  getDirectoryLocations,
  getDirectorySpecialties,
} from "@/lib/directory.functions";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/tailors/$citySlug")({
  // Dynamic routes are always excluded from sitemapStaticPaths (see src/lib/sitemap.ts);
  // known city slugs are added explicitly in sitemap.xml.ts instead.
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const locations = await getDirectoryLocations();
    const resolved = resolveLocationSlug(params.citySlug, locations);
    const [page, specialties, language] = await Promise.all([
      getDirectoryListings({
        data: resolved
          ? { state: resolved.state ?? undefined, city: resolved.city ?? undefined }
          : {},
      }),
      getDirectorySpecialties(),
      resolveLanguage({ data: { urlLang: deps.lang } }),
    ]);
    const resources = await loadNamespaces(language, ["common", "directory"]);
    return { page, specialties, resolved, citySlug: params.citySlug, language, resources };
  },
  head: ({ loaderData }) => {
    const label = loaderData?.resolved?.label ?? loaderData?.citySlug ?? "your area";
    return {
      meta: [
        { title: `Jaylor tailors in ${label}` },
        {
          name: "description",
          content: `Browse Jaylor tailors in ${label}. Get measured once, use your Measurement Passport with any of them.`,
        },
        { property: "og:title", content: `Jaylor tailors in ${label}` },
        {
          property: "og:description",
          content: `Browse Jaylor tailors in ${label} and chat with them directly on WhatsApp.`,
        },
      ],
    };
  },
  component: TailorsCityPage,
});

function TailorsCityPage() {
  const online = useOnlineStatus();
  const { page, specialties, resolved, citySlug, language, resources } = Route.useLoaderData();
  const label = resolved?.label ?? citySlug;

  return (
    <I18nProvider language={language} resources={resources}>
      <TailorsCityPageContent
        online={online}
        page={page}
        specialties={specialties}
        resolved={resolved}
        label={label}
      />
    </I18nProvider>
  );
}

function TailorsCityPageContent({
  online,
  page,
  specialties,
  resolved,
  label,
}: {
  online: boolean;
  page: ReturnType<typeof Route.useLoaderData>["page"];
  specialties: ReturnType<typeof Route.useLoaderData>["specialties"];
  resolved: ReturnType<typeof Route.useLoaderData>["resolved"];
  label: string;
}) {
  const t = useT("directory");
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-5xl px-4 py-12 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl sm:text-4xl">
            {t("city_page_title", { city: label })}
          </h1>
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
              locations={[]}
              specialties={specialties}
              fixedState={resolved?.state ?? null}
              fixedCity={resolved?.city ?? null}
              emptyLabel={t("empty_city", { city: label })}
            />
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}
