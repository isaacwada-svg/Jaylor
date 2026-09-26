import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";
import { TERMS_LAST_UPDATED, TermsBody } from "@/components/jaylor/terms-content";

export const Route = createFileRoute("/terms")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Terms of Service — Jaylor" },
      { name: "description", content: "The terms governing business use of Jaylor in Nigeria." },
      { property: "og:title", content: "Terms of Service — Jaylor" },
      { property: "og:description", content: "The terms governing business use of Jaylor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated={TERMS_LAST_UPDATED}>
      <TermsBody />
    </LegalLayout>
  );
}
