import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/jaylor/marketing-layout";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { useOnlineStatus } from "@/lib/use-online-status";
import { DirectoryResults } from "@/components/jaylor/directory-search";
import {
  getDirectoryListings,
  getDirectoryLocations,
  getDirectorySpecialties,
} from "@/lib/directory.functions";

export const Route = createFileRoute("/tailors")({
  staticData: { sitemap: true },
  loader: async () => {
    const [page, locations, specialties] = await Promise.all([
      getDirectoryListings({ data: {} }),
      getDirectoryLocations(),
      getDirectorySpecialties(),
    ]);
    return { page, locations, specialties };
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
    ],
  }),
  component: TailorsPage,
});

function TailorsPage() {
  const online = useOnlineStatus();
  const { page, locations, specialties } = Route.useLoaderData();

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-5xl px-4 py-12 lg:px-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Find a Jaylor tailor</h1>
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
              locations={locations}
              specialties={specialties}
              emptyLabel="Know a great tailor? Invite them to Jaylor."
            />
          </div>
        )}
      </section>
    </MarketingLayout>
  );
}
