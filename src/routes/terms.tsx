import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/jaylor/legal-layout";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Jaylor" }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="20 September 2026">
      <section>
        <h2>Agreement</h2>
        <p>
          These terms govern your use of Jaylor, a product of Bethjay Global Enterprise Limited (RC
          [registration number]). By creating a store, you agree to these terms on behalf of your
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
          effect at the end of the current billing period. Refunds are considered case by case
          within [refund window] of a charge; contact us to request one.
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
