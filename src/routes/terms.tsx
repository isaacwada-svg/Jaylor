import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";
import { SUPPORT_EMAIL } from "@/lib/jaylor";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms of Service — Jaylor" },
    { name: "description", content: "The terms governing business use of Jaylor in Nigeria." },
    { property: "og:title", content: "Terms of Service — Jaylor" },
    { property: "og:description", content: "The terms governing business use of Jaylor." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="20 September 2026">
      <section>
        <h2>Agreement</h2>
        <p>
          These terms govern your use of Jaylor, a product of Bethjay Global Enterprise Limited (RC
          3283706), FCT Abuja, Nigeria. By creating a store, you agree to these terms on behalf of your
          business.
        </p>
      </section>

      <section>
        <h2>Your account and store</h2>
        <p>
          You&apos;re responsible for the accuracy of the information in your store and for keeping
          your login secure. Store independence is core to Jaylor: your store&apos;s data is never
          shown to another store, and there is no shared marketplace or directory.
        </p>
      </section>

      <section>
        <h2>Data processing agreement (for stores)</h2>
        <p>
          For any personal data of your clients or customers that you process using Jaylor, you are
          the data controller and Bethjay Global Enterprise Limited is your data processor. We
          process that data only to provide the service, under your instructions, and with the
          security measures described in our <a href="/security">Security page</a>.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>
            Don&apos;t use Jaylor to send unsolicited messages to people who haven&apos;t consented.
          </li>
          <li>Don&apos;t attempt to access another store&apos;s data or bypass plan limits.</li>
          <li>Don&apos;t use the platform for anything unlawful under Nigerian law.</li>
        </ul>
      </section>

      <section>
        <h2>Subscription, billing and cancellation</h2>
        <p>
          Plans and prices are shown in the app and on our pricing page and are billed in the
          currency shown for your country. New stores get a 14-day Growth trial; afterwards, stores
          continue on Growth if they subscribe, or move to Free automatically — all existing data is
          kept either way. You can cancel or downgrade at any time from Billing; cancellation takes
          effect at the end of the current billing period. Except where law requires otherwise,
          subscription charges already paid are non-refundable. If we make an incorrect or duplicate
          charge, contact us within 14 days so we can investigate and correct it.
        </p>
      </section>

      <section>
        <h2>WhatsApp messaging</h2>
        <p>
          Automatic-message allowances cover transactional utility messages, such as order updates
          and appointment reminders. They do not include marketing campaigns. Delivery depends on
          the recipient&apos;s consent, WhatsApp availability and Meta&apos;s rules. Allowances and fair-use
          limits may change if provider rates change; we will give reasonable notice of material changes.
        </p>
      </section>

      <section>
        <h2>Your content and our service</h2>
        <p>
          You retain ownership of store information, photographs and other content you submit. You
          give us the limited permission needed to host, process, display and back up that content
          for your use of Jaylor. Jaylor, its branding and software remain our intellectual property.
        </p>
      </section>

      <section>
        <h2>Suspension, termination and data export</h2>
        <p>
          We may suspend access where necessary to prevent abuse, fraud, security harm or unlawful
          use, and will give notice where reasonably possible. Before closing your store, owners can
          export supported records from the app. Closing an account does not remove obligations or
          liabilities that arose before closure.
        </p>
      </section>

      <section>
        <h2>Electronic agreement and Nigerian law</h2>
        <p>
          You agree that electronic actions, notices and records may satisfy writing and signature
          requirements to the extent allowed by Nigerian law. These terms are governed by the laws
          of the Federal Republic of Nigeria. We will first try to resolve disputes in good faith;
          unresolved disputes are subject to the courts of the Federal Capital Territory, Abuja.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions, complaints and billing disputes can be sent to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          Jaylor is provided &quot;as is.&quot; To the extent permitted by law, Bethjay Global
          Enterprise Limited is not liable for indirect or consequential losses arising from use of
          the service. Nothing in these terms limits liability that cannot be limited under Nigerian
          law.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update these terms from time to time. Material changes will be announced in the
          app.
        </p>
      </section>
    </LegalLayout>
  );
}
