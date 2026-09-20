import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";
import { SUPPORT_EMAIL } from "@/lib/jaylor";

export const Route = createFileRoute("/security")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Security — Jaylor" },
      {
        name: "description",
        content: "How Jaylor protects tailoring-business and customer information.",
      },
      { property: "og:title", content: "Security — Jaylor" },
      {
        property: "og:description",
        content: "The safeguards Jaylor uses to protect business and customer information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Security,
});

function Security() {
  return (
    <LegalLayout title="Security" lastUpdated="20 September 2026">
      <section>
        <h2>Account and operational safeguards</h2>
        <p>
          Authentication is handled through managed identity services. Sensitive operations require
          signed-in access, business records are backed up by our managed infrastructure, and access
          rules are reviewed as the product changes. Store owners remain responsible for choosing
          strong passwords and removing team members who should no longer have access.
        </p>
      </section>

      <section>
        <h2>Incident response</h2>
        <p>
          We investigate suspected security incidents, contain affected systems and preserve
          relevant records. Where a personal-data breach creates a legal notification duty, we will
          notify the Nigeria Data Protection Commission and affected organisations or people without
          undue delay, following the timelines required by the NDPA and current NDPC guidance.
        </p>
      </section>

      <section>
        <h2>Store independence</h2>
        <p>
          Every table that holds business data carries a store_id, and row-level security is enabled
          on every one of them. A tailor logged into one store cannot read or write another
          store&apos;s clients, orders, measurements or payments. This is enforced by the database
          itself, not just by the app&apos;s screens.
        </p>
      </section>

      <section>
        <h2>Role separation</h2>
        <p>
          Owners, managers and tailors see different things by design. Tailors work from a database
          view that never includes prices, costs, payments or balances. Those columns simply
          aren&apos;t present in what a tailor&apos;s account can query, regardless of what the
          interface shows.
        </p>
      </section>

      <section>
        <h2>Public and customer-facing pages</h2>
        <p>
          Booking pages, storefronts and group-order links work without an account, but they never
          expose your client list or order book. Anonymous visitors can only submit new requests
          (booking, sew, guest updates on their own invite). They cannot read anyone else&apos;s
          data, and each of those intake forms is rate-limited to stop automated spam.
        </p>
      </section>

      <section>
        <h2>Support access</h2>
        <p>
          Bethjay staff cannot open a store&apos;s data by default. An owner must explicitly grant
          time-limited access (24 or 72 hours) from Settings, it expires automatically, can be
          revoked at any time, and every access is written to an audit log the owner can see.
        </p>
      </section>

      <section>
        <h2>Payments</h2>
        <p>
          Jaylor never stores card numbers. Customer payments are designed to route to a
          store&apos;s own payment account, never through a shared Jaylor balance.
        </p>
      </section>

      <section>
        <h2>Transport and headers</h2>
        <p>
          All traffic is served over HTTPS with HSTS enabled, and responses set standard hardening
          headers (no content-type sniffing, no framing by other sites, a restrictive referrer
          policy).
        </p>
      </section>

      <section>
        <h2>Responsible disclosure</h2>
        <p>
          If you believe you&apos;ve found a security issue, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> rather than testing against live
          customer stores. Include enough detail for us to reproduce the issue. We aim to
          acknowledge reports within 2 business days.
        </p>
      </section>
    </LegalLayout>
  );
}
