import { SUPPORT_EMAIL } from "@/lib/jaylor";

export const TERMS_LAST_UPDATED = "25 September 2026";

/** Shared body of the Terms of Service — rendered on the /terms page and inside the signup gate dialog. */
export function TermsBody() {
  return (
    <>
      <section>
        <h2>Agreement</h2>
        <p>
          These terms govern your use of Jaylor, a product of Bethjay Global Enterprise Limited (RC
          3283706), FCT Abuja, Nigeria. By creating a store, you agree to these terms on behalf of
          your business.
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
          continue on Growth if they subscribe, or move to Free automatically. All existing data is
          kept either way. You can cancel or downgrade at any time from Billing; cancellation takes
          effect at the end of the current billing period. Except where law requires otherwise,
          subscription charges already paid are non-refundable. If we make an incorrect or duplicate
          charge, contact us within 14 days so we can investigate and correct it.
        </p>
      </section>

      <section>
        <h2>Jaylor Pay (accepting client payments)</h2>
        <p>
          Jaylor Pay lets you send clients a secure payment link on an order. It is a technology
          feature that connects your store to a payment link generated through Paystack, a licensed
          Nigerian payment processor. Jaylor is not a bank, does not hold client funds at any point,
          and is not a party to the underlying sale of goods or services between you and your
          client.
        </p>
        <ul>
          <li>
            <strong>Connecting your account.</strong> To activate Jaylor Pay you provide your own
            Nigerian bank account details. We verify the account name with your bank through
            Paystack before activation, and for your security you must re-enter your password before
            connecting or changing the payout account.
          </li>
          <li>
            <strong>Platform fee.</strong> Each successful collection carries a platform fee, shown
            in-app and on our pricing page, that is set by your plan (currently 1.5% on Free, 1% on
            Growth and during your trial, 0.7% on Business, or a negotiated rate on a custom plan).
            The fee is deducted automatically from the payment before settlement — you never receive
            an invoice for it separately.
          </li>
          <li>
            <strong>Getting paid.</strong> The amount collected, less the platform fee, settles
            directly from Paystack to your connected bank account on Paystack&apos;s standard
            settlement schedule. Jaylor never receives, custodies or routes these funds itself.
          </li>
          <li>
            <strong>International and diaspora clients.</strong> A client paying from abroad can pay
            by card in their own currency; Paystack converts the payment and settles you in naira.
            The exchange rate and any card-network conversion fee are set by Paystack and its
            partners, not by Jaylor, and can change without notice.
          </li>
          <li>
            <strong>Accuracy of your bank details.</strong> You are responsible for keeping your
            connected account accurate and under your business&apos;s control. Jaylor is not liable
            for funds settled to an account you provided incorrectly, though we will assist you in
            working with Paystack to try to recover them.
          </li>
          <li>
            <strong>Refunds, chargebacks and disputes.</strong> As the merchant of record for the
            underlying tailoring order, you are responsible for refunds you agree to give a client
            and for responding to any chargeback or dispute a client&apos;s bank or card issuer
            raises. Jaylor facilitates the payment link but does not decide, fund or guarantee the
            outcome of a dispute.
          </li>
          <li>
            <strong>Suspension.</strong> We may pause Jaylor Pay for a store where we reasonably
            suspect fraud, abuse, or a breach of these terms or of Paystack&apos;s own merchant
            terms, and will give notice where reasonably possible.
          </li>
        </ul>
      </section>

      <section>
        <h2>WhatsApp messaging</h2>
        <p>
          Automatic-message allowances cover transactional utility messages, such as order updates
          and appointment reminders. They do not include marketing campaigns. Delivery depends on
          the recipient&apos;s consent, WhatsApp availability and Meta&apos;s rules. Allowances and
          fair-use limits may change if provider rates change; we will give reasonable notice of
          material changes.
        </p>
      </section>

      <section>
        <h2>Your content and our service</h2>
        <p>
          You retain ownership of store information, photographs and other content you submit. You
          give us the limited permission needed to host, process, display and back up that content
          for your use of Jaylor. Jaylor, its branding and software remain our intellectual
          property.
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
    </>
  );
}
