import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Jaylor" }] }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="20 September 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          Jaylor is a product of Bethjay Global Enterprise Limited (RC [registration number]), based
          in Abuja, Nigeria. Our full registered office address is available on request and appears
          on your store&apos;s subscription invoices; our public pages show only the city, in line
          with our own security practice.
        </p>
      </section>

      <section>
        <h2>Stores are controllers, Jaylor is the processor</h2>
        <p>
          Each tailoring business or fashion house using Jaylor (a &quot;store&quot;) is the data
          controller for its own clients&apos; personal data — the store decides what to record and
          why. Bethjay Global Enterprise Limited, as the maker of Jaylor, acts as a data processor:
          we process that data only on the store&apos;s instructions, to provide the service.
        </p>
      </section>

      <section>
        <h2>What we collect and why</h2>
        <ul>
          <li>
            <strong>Account information</strong> (name, email, phone) — to create and secure your
            account and your store&apos;s workroom.
          </li>
          <li>
            <strong>Store data entered by you or your team</strong> (clients, measurements, orders,
            payments, consultations, events, expenses) — to run the store&apos;s business on your
            behalf, at your instruction.
          </li>
          <li>
            <strong>Customer data submitted directly by your customers</strong> (booking requests,
            sew requests, event RSVPs) — to fulfil the request they made to your store.
          </li>
          <li>
            <strong>Usage data</strong> (page visits, feature usage counts) — to keep the app
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
          Store data is kept for as long as the store&apos;s account is active. Downgrading a plan
          never deletes or hides existing records. If a store closes its account, data is held for a
          recovery window before permanent deletion, as described in the app.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Under the Nigeria Data Protection Act 2023 (NDPA), and in a manner consistent with the
          EU/UK GDPR for customers outside Nigeria, individuals have the right to access, correct,
          export and request deletion of their personal data. Customers should contact the store
          they dealt with directly; stores can export or delete a client&apos;s record at any time
          from within Jaylor. Store owners and staff can contact us using the details below.
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
        <h2>Contact and complaints</h2>
        <p>
          For questions about this policy, contact our Data Protection Officer at
          [dpo@bethjay.example] or via WhatsApp through the contact details on our{" "}
          <a href="/about">About page</a>. You may also lodge a complaint with the Nigeria Data
          Protection Commission (NDPC).
        </p>
      </section>
    </LegalLayout>
  );
}
