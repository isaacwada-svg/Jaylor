import { createFileRoute } from "@tanstack/react-router";
import { getRouterInstance } from "@tanstack/react-start";
import { sitemapStaticPaths, sitemapXML, type SitemapEntry } from "@/lib/sitemap";
import { JOB_LANDING_CONTENT } from "@/lib/job-landing-content";
import { slugifyLocation } from "@/lib/directory";
import { getDirectoryLocations } from "@/lib/directory.functions";

const BASE_URL = "https://jaylor.com.ng";

export const Route = createFileRoute("/sitemap.xml")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        const router = await getRouterInstance();
        const locations = await getDirectoryLocations().catch(() => []);
        const citySlugs = new Set(
          locations
            .map((l) =>
              l.city ? slugifyLocation(l.city) : l.state ? slugifyLocation(l.state) : null,
            )
            .filter((slug): slug is string => !!slug),
        );
        const entries: SitemapEntry[] = [
          ...sitemapStaticPaths(router).map((path) => ({ path })),
          ...JOB_LANDING_CONTENT.map((j) => ({ path: `/jobs/${j.slug}` })),
          ...[...citySlugs].map((slug) => ({ path: `/tailors/${slug}` })),
        ];
        if (entries.length === 0) {
          return new Response(
            'No pages are included in this sitemap. Check route decisions and ancestor exclusions. Setting "exclude-subtree" on the root excludes the entire site.',
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }
        return new Response(sitemapXML(BASE_URL, entries), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
