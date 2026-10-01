import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/jaylor";

// Required by Google Play's account-deletion policy for apps with accounts:
// a public page explaining how to request deletion, reachable without
// installing the app or signing in, plus an in-app path to the same
// instructions (see the "Close your store" section on
// /_authenticated/privacy.tsx, which links here).
export const Route = createFileRoute("/delete-account")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Delete your account: Jaylor" },
      {
        name: "description",
        content: "How to request deletion of your Jaylor account and data, and what is kept.",
      },
      { property: "og:title", content: "Delete your account: Jaylor" },
      {
        property: "og:description",
        content: "How to request deletion of your Jaylor account and data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeleteAccount,
});

function DeleteAccount() {
  return (
    <LegalLayout title="Delete your account" lastUpdated="1 October 2026">
      <section>
        <p>
          This page explains how to request deletion of a Jaylor account and its data, whether or
          not you still have the app installed or can sign in.
        </p>
      </section>

      <section>
        <h2>Who this is for</h2>
        <p>
          <strong>Store owners, managers and staff</strong> with a Jaylor sign-in can request
          deletion of their own account and, if they own the store, the store&apos;s entire record.{" "}
          <strong>A tailor shop&apos;s own clients</strong> (people who never signed up for Jaylor
          themselves) should ask the shop they dealt with to delete their record. The shop is the
          data controller and can do this directly from a client&apos;s profile in Jaylor. If the
          shop is unreachable, contact us using the details below and we will help.
        </p>
      </section>

      <section>
        <h2>How to request deletion</h2>
        <p>
          <strong>In the app:</strong> sign in, go to Settings → Privacy and data, and use{" "}
          <strong>Close your store</strong> (store owners) or ask your store&apos;s owner to do this
          on your behalf (staff accounts).
        </p>
        <p>
          <strong>Without signing in, or if you no longer have the app:</strong> email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or message{" "}
          <a href="https://wa.me/2349028101389">{SUPPORT_PHONE}</a> with &quot;Delete my
          account&quot;, your store name or handle, and the email address on the account, so we can
          verify it&apos;s you before deleting anything.
        </p>
      </section>

      <section>
        <h2>What gets deleted</h2>
        <ul>
          <li>Your sign-in and profile (name, email, phone).</li>
          <li>
            The store&apos;s business records: clients, measurements, orders, payments,
            consultations, events and expenses.
          </li>
          <li>Uploaded photos (fabric, style references, progress photos).</li>
          <li>Any public pages tied to the store (storefront, shared links, Style Books).</li>
        </ul>
      </section>

      <section>
        <h2>What we may keep, and why</h2>
        <p>
          Some records can&apos;t be deleted immediately: payment and transaction records we are
          required to keep for tax and financial-regulation purposes, and anything needed to
          investigate fraud, abuse or a legal dispute already in progress. We keep only what the law
          requires, for only as long as it requires it, and we delete or anonymise it as soon as
          that requirement ends. See our <a href="/privacy-policy">Privacy Policy</a> for the full
          retention rules.
        </p>
      </section>

      <section>
        <h2>How long it takes</h2>
        <p>
          We acknowledge deletion requests promptly and complete verified requests within the period
          required by applicable law (the Nigeria Data Protection Act 2023), in practice within 30
          days. Closing a store is permanent and cannot be undone once completed, so we confirm with
          you before anything is removed.
        </p>
      </section>
    </LegalLayout>
  );
}
