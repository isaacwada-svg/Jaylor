import type { JobType } from "@/lib/job-templates";

/**
 * Marketing copy for the "What kind of job?" homepage tiles and their landing
 * pages — kept separate from job-templates.ts, which is product logic (the
 * defaults a template sets on an event), not marketing copy.
 */
export type JobLandingContent = {
  jobType: JobType;
  slug: string;
  tileLabel: string;
  headline: string;
  pain: string;
  flow: string;
};

export const JOB_LANDING_CONTENT: JobLandingContent[] = [
  {
    jobType: "aso_ebi",
    slug: "aso-ebi",
    tileLabel: "Aso-ebi",
    headline: "Aso-ebi without the WhatsApp chaos",
    pain: "Twenty to two hundred guests, all asking for the price, all sending measurements in different formats, all wanting to know when it's ready.",
    flow: "Create the aso-ebi order, share one link. Each guest measures themselves (or books to come in), picks a style, sees the price and pays their own share. You watch it fill up from one screen.",
  },
  {
    jobType: "burial",
    slug: "burial",
    tileLabel: "Burial",
    headline: "Burial aso-ebi, sorted in minutes, not days",
    pain: "Short notice, a grieving family, and dozens of relatives who all need the same outfit by the same tight date.",
    flow: "Start a burial order — it defaults to rush mode. Share the link, a sponsor can cover some members while others pay their own way, and you see who's measured and who's paid at a glance.",
  },
  {
    jobType: "family_occasion",
    slug: "family-occasion",
    tileLabel: "Family occasion",
    headline: "One parent pays, the whole family measures",
    pain: "Christmas, Sallah, a naming — one person is paying for everyone, but you still need six sets of measurements.",
    flow: "Create the occasion, one payer covers it all. Every family member gets their own link to confirm measurements, and next year you just duplicate the same job.",
  },
  {
    jobType: "association",
    slug: "church-or-association",
    tileLabel: "Church or association",
    headline: "Uniforms for a whole congregation, without a spreadsheet",
    pain: "Hundreds of members, a coordinator chasing measurements on paper, and no way to see who's paid.",
    flow: "One link for the whole group. Members measure and pay their own way, and your dashboard shows exactly who's left.",
  },
  {
    jobType: "school_uniform",
    slug: "school-uniforms",
    tileLabel: "School uniforms",
    headline: "A school uniform contract that looks like a real business",
    pain: "A school wants a proper quote, a PO number and an invoice — not a WhatsApp message with a price in it.",
    flow: "Pick sizes instead of measurements, set quantity price bands, and send a real quote. Once accepted it becomes a live job with an invoice number, batches and delivery tracking.",
  },
  {
    jobType: "corporate_uniform",
    slug: "company-uniforms",
    tileLabel: "Company uniforms",
    headline: "Win the hotel or company uniform contract",
    pain: "Formal procurement means a quote, VAT, payment terms and an invoice — the one document that actually wins the job.",
    flow: "Build the quote with quantity, unit price, VAT and deposit terms. Send it, they accept it, and it becomes a tracked contract with batches, delivery and balance owed.",
  },
  {
    jobType: "sports_team",
    slug: "team-kit",
    tileLabel: "Team kit",
    headline: "Team kit, by name and number",
    pain: "A whole squad needs the same kit, sized not measured, on a short timeline before the next match.",
    flow: "One link for the team. Each player picks their size, the manager sees everyone's status, and you track production as one batch.",
  },
  {
    jobType: "diaspora",
    slug: "clients-abroad",
    tileLabel: "Clients abroad",
    headline: "Clients abroad, without the back-and-forth",
    pain: "A client in London or Houston wants an outfit made at home — measuring, paying and shipping all feel harder from a distance.",
    flow: "Send a link with a delivery address and shipping fee attached. They self-measure, pay by card in their own currency, and you see the naira amount you'll receive.",
  },
  {
    jobType: "remote_individual",
    slug: "one-client-remote",
    tileLabel: "One client, remote",
    headline: "The client who just can't come in this week",
    pain: "Every tailor has one — a regular who's busy, travelling, or just can't make it to the shop for measurements.",
    flow: "From their client record, tap Send measure link. They open it, measure themselves, pay a deposit if you ask for one, and you carry on as normal.",
  },
  {
    jobType: "ready_to_wear",
    slug: "pre-order-a-collection",
    tileLabel: "Pre-order a collection",
    headline: "Sell a collection before you cut a single piece",
    pain: "You've designed a small collection and want to know what to make before spending on fabric.",
    flow: "Share one link with your pieces and sizes. Buyers pick, pay upfront, and closing the job gives you a production list grouped by size.",
  },
];

export function jobLandingBySlug(slug: string): JobLandingContent | undefined {
  return JOB_LANDING_CONTENT.find((j) => j.slug === slug);
}
