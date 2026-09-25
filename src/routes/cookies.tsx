import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";

export const Route = createFileRoute("/cookies")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Cookie Notice — Jaylor" },
      {
        name: "description",
        content: "How Jaylor uses essential browser storage and first-party analytics.",
      },
      { property: "og:title", content: "Cookie Notice — Jaylor" },
      {
        property: "og:description",
        content: "How Jaylor uses essential browser storage and first-party analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cookies,
});

function Cookies() {
  return (
    <LegalLayout title="Cookie Notice" lastUpdated="20 September 2026">
      <section>
        <h2>Essential storage, always on</h2>
        <p>
          Jaylor uses session tokens strictly needed to run the app: keeping you signed in, keeping
          each shop&apos;s data separate, remembering which store you&apos;re working in, and your
          interface preferences (like light or dark mode). We also store a random first-party
          visitor identifier to count landing-page visits and completed sign-ups. It does not follow
          you across other websites.
        </p>
      </section>

      <section>
        <h2>Optional analytics, only with your permission</h2>
        <p>
          When you first visit, we ask for your choice. If you tap <strong>Accept All</strong>, we
          load Google Analytics (to see which pages are used) and Microsoft Clarity (to find
          confusing screens and catch errors on phones), and we record app errors to help us fix
          them. These tools may set their own cookies. If you tap <strong>Reject All</strong>, none
          of them load and no marketing or tracking cookies are set. We never use advertising
          cookies.
        </p>
      </section>

      <section>
        <h2>What we store and where</h2>
        <ul>
          <li>
            <strong>Session storage</strong>: keeps you signed in between visits, managed by our
            authentication provider.
          </li>
          <li>
            <strong>Local storage</strong>: remembers your current store, theme preference, and a
            small install-prompt/visit counter for the installable app experience, plus the random
            first-party identifier used for conversion measurement.
          </li>
          <li>
            <strong>Service worker cache</strong>: lets previously visited pages open again if you
            lose connection.
          </li>
        </ul>
      </section>

      <section>
        <h2>Managing storage</h2>
        <p>
          You can clear cookies and site data at any time from your browser settings. Doing so will
          sign you out and reset your local preferences, but never deletes any data stored in your
          Jaylor account.
        </p>
      </section>
    </LegalLayout>
  );
}
