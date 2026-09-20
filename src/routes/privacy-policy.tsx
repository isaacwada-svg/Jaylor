import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/jaylor";

export const Route = createFileRoute("/privacy-policy")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Privacy Policy — Jaylor" },
      {
        name: "description",
        content:
          "How Jaylor collects, uses, protects and shares personal data under Nigeria's data-protection law.",
      },
      { property: "og:title", content: "Privacy Policy — Jaylor" },
      {
        property: "og:description",
        content: "How Jaylor protects personal data and supports your privacy rights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="20 September 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          Jaylor is a product of Bethjay Global Enterprise Limited (RC 3283706), FCT Abuja, Nigeria.
          We are responsible for account, billing, security and service-usage data. Each store is
          responsible for the client information it chooses to enter into Jaylor.
        </p>
      </section>

      <section>
        <h2>Stores are controllers, Jaylor is the processor</h2>
        <p>
          Each tailoring business or fashion house using Jaylor (a &quot;store&quot;) is the data
          controller for its own clients&apos; personal data: the store decides what to record and
          why. Bethjay Global Enterprise Limited, as the maker of Jaylor, acts as a data processor:
          we process that data only on the store&apos;s instructions, to provide the service.
        </p>
      </section>

      <section>
        <h2>What we collect and why</h2>
        <ul>
          <li>
            <strong>Account information</strong> (name, email, phone): to create and secure your
            account and your store&apos;s workroom.
          </li>
          <li>
            <strong>Store data entered by you or your team</strong> (clients, measurements, orders,
            payments, consultations, events, expenses): to run the store&apos;s business on your
            behalf, at your instruction.
          </li>
          <li>
            <strong>Customer data submitted directly by your customers</strong> (booking requests,
            sew requests, event RSVPs): to fulfil the request they made to your store.
          </li>
          <li>
            <strong>Usage data</strong> (page visits, feature usage counts): to keep the app
            reliable and to enforce plan limits fairly.
          </li>
        </ul>
      </section>

      <section>
        <h2>Lawful bases for processing</h2>
        <p>
          We and our store customers rely on: performance of a contract (running your workroom or
          fulfilling a customer&apos;s request), consent (WhatsApp messages and use of photos, which
          stores collect directly from their own clients), and legitimate interests (keeping the
          service secure and improving it).
        </p>
      </section>

      <section>
        <h2>Retention</h2>
        <p>
          Store data is kept while the account is active and only as long afterwards as needed for
          recovery, legal obligations, disputes and fraud prevention. Store owners can export their
          records. We securely delete or anonymise data when it is no longer required.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Under the Nigeria Data Protection Act 2023 and the NDPC General Application and
          Implementation Directive 2025, individuals may request access, correction, deletion,
          restriction, portability, or object to certain processing. They may also withdraw consent
          without affecting earlier lawful processing. Customers should contact the store they dealt
          with directly; stores can export or delete a client&apos;s record at any time from within
          Jaylor. Store owners and staff can contact us using the details below.
        </p>
      </section>

      <section>
        <h2>Service providers and international processing</h2>
        <p>
          We use carefully selected providers for hosting, authentication, storage, communications
          and payment processing. Some may process data outside Nigeria. Where data crosses borders,
          we use safeguards recognised by the NDPA and applicable NDPC guidance. We do not sell
          personal data.
        </p>
      </section>

      <section>
        <h2>Cross-border transfers</h2>
        <p>
          Jaylor&apos;s infrastructure may process and store data outside Nigeria. Where this
          happens, we rely on appropriate safeguards recognised under the NDPA and, where relevant,
          GDPR-standard contractual clauses.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use row-level access controls so that one store can never see another store&apos;s
          data, encrypt data in transit, and limit staff access to a time-limited, audited grant
          that a store owner must approve. See our <a href="/security">Security page</a> for more.
        </p>
      </section>

      <section>
        <h2>Children&apos;s data</h2>
        <p>
          Where a store records measurements or details for a client under 18, we require the store
          to record a parent or guardian&apos;s name and phone number and their consent before
          saving that record.
        </p>
      </section>

      <section>
        <h2>Automated features and analytics</h2>
        <p>
          Jaylor may use automated tools to draft designs, prices, orders or replies for a person to
          review. We do not use solely automated decisions that produce legal or similarly
          significant effects. We collect limited first-party usage events to measure visits,
          sign-ups and product activation; we do not use them for cross-site advertising.
        </p>
      </section>

      <section>
        <h2>Changes and complaints</h2>
        <p>
          We will post material changes here and, where appropriate, notify account holders. If we
          cannot resolve a privacy concern, you may complain to the Nigeria Data Protection
          Commission.
        </p>
      </section>

      <section>
        <h2>Contact and complaints</h2>
        <p>
          For privacy requests or questions, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or message{" "}
          <a href="https://wa.me/2349028101389">{SUPPORT_PHONE}</a>. We aim to acknowledge requests
          promptly and respond within the period required by applicable law.
        </p>
      </section>
    </LegalLayout>
  );
}
