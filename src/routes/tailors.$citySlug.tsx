import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { DirectoryResults } from "@/components/jaylor/directory-search";
import { resolveLocationSlug } from "@/lib/directory";
import {
  getDirectoryListings,
  getDirectoryLocations,
  getDirectorySpecialties,
} from "@/lib/directory.functions";

export const Route = createFileRoute("/tailors/$citySlug")({
  // Dynamic routes are always excluded from sitemapStaticPaths (see src/lib/sitemap.ts);
  // known city slugs are added explicitly in sitemap.xml.ts instead.
  staticData: { sitemap: false },
  loader: async ({ params }) => {
    const locations = await getDirectoryLocations();
    const resolved = resolveLocationSlug(params.citySlug, locations);
    const [page, specialties] = await Promise.all([
      getDirectoryListings({
        data: resolved
          ? { state: resolved.state ?? undefined, city: resolved.city ?? undefined }
          : {},
      }),
      getDirectorySpecialties(),
    ]);
    return { page, specialties, resolved, citySlug: params.citySlug };
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
  const { page, specialties, resolved, citySlug } = Route.useLoaderData();
  const label = resolved?.label ?? citySlug;

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-5xl px-4 py-12 lg:px-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Jaylor tailors in {label}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Every shop here is on Jaylor and keeps its client records up to date. If you have a Jaylor
          Passport, share it with any of them instead of getting measured again.
        </p>

        {!online ? (
          <div className="mt-8">
            <OfflineNotice label="Connect to the internet to browse the directory." />
          </div>
        ) : (
          <div className="mt-8">
            <DirectoryResults
              initialData={page}
              locations={[]}
              specialties={specialties}
              fixedState={resolved?.state ?? null}
              fixedCity={resolved?.city ?? null}
              emptyLabel={`No Jaylor tailors listed in ${label} yet. Know a great tailor? Invite them to Jaylor.`}
            />
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}
