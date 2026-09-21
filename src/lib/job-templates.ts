/**
 * The group-order engine is one model (job_type/payer_mode/collection_mode/
 * pricing_mode/turnaround_mode on `events`) wearing different labels per use
 * case. This file is the single place that maps a template the creator picks
 * to those defaults, so the create flow only has to render a picker plus the
 * existing form — not a different form per use case.
 */

export type PayerMode = "each_pays" | "single_payer" | "mixed";
export type CollectionMode = "measurements" | "sizes" | "none";
export type PricingMode = "flat" | "by_garment" | "quantity_tiers";
export type TurnaroundMode = "standard" | "rush";

export type JobType =
  | "aso_ebi"
  | "burial"
  | "bridal_party"
  | "family_occasion"
  | "association"
  | "school_uniform"
  | "corporate_uniform"
  | "event_staff"
  | "sports_team"
  | "diaspora"
  | "remote_individual"
  | "ready_to_wear";

export type JobTemplate = {
  jobType: JobType;
  label: string;
  description: string;
  namePlaceholder: string;
  payerMode: PayerMode;
  collectionMode: CollectionMode;
  pricingMode: PricingMode;
  turnaroundMode: TurnaroundMode;
  /** Shown on the public /e/:token guest page, {name} is the participant's first name. */
  guestWelcomeLine: string;
  /** Starts as a quote needing client acceptance, with a formal invoice once live (G3). */
  isContract: boolean;
};

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    jobType: "aso_ebi",
    label: "Aso-ebi",
    description: "A wedding or owambe — each guest measures and pays their own share.",
    namePlaceholder: "Adeyemi wedding aso-ebi",
    payerMode: "each_pays",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, welcome to the group order.",
    isContract: false,
  },
  {
    jobType: "burial",
    label: "Burial",
    description: "Short notice, family aso-ebi for a funeral — rush turnaround by default.",
    namePlaceholder: "Chief Okafor burial aso-ebi",
    payerMode: "each_pays",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "rush",
    guestWelcomeLine: "Hi {name}, our condolences. Here's the group order for the burial.",
    isContract: false,
  },
  {
    jobType: "family_occasion",
    label: "Family occasion",
    description: "Christmas, Sallah, naming or a birthday — one parent usually pays for all.",
    namePlaceholder: "Family Christmas outfits",
    payerMode: "single_payer",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, please confirm your measurements for this occasion.",
    isContract: false,
  },
  {
    jobType: "association",
    label: "Church or association",
    description: "Uniforms for a church, mosque or association — members pay their own way.",
    namePlaceholder: "Women's fellowship uniform",
    payerMode: "each_pays",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, welcome to the group uniform order.",
    isContract: false,
  },
  {
    jobType: "school_uniform",
    label: "School uniforms",
    description: "A school's own uniform contract, sized rather than measured, term after term.",
    namePlaceholder: "Bright Stars School uniforms — 1st term",
    payerMode: "single_payer",
    collectionMode: "sizes",
    pricingMode: "quantity_tiers",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, please confirm your size for the school uniform.",
    isContract: true,
  },
  {
    jobType: "corporate_uniform",
    label: "Company uniforms",
    description: "Staff uniforms for a company or hotel — a formal quote and invoice.",
    namePlaceholder: "Lagos Continental Hotel staff uniforms",
    payerMode: "single_payer",
    collectionMode: "sizes",
    pricingMode: "quantity_tiers",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, please confirm your size for the staff uniform.",
    isContract: true,
  },
  {
    jobType: "sports_team",
    label: "Team kit",
    description: "Kit for a sports team or campaign crew, by name and number.",
    namePlaceholder: "Eagles FC away kit",
    payerMode: "single_payer",
    collectionMode: "sizes",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, please confirm your size for the team kit.",
    isContract: false,
  },
  {
    jobType: "diaspora",
    label: "Order from abroad",
    description: "A client outside Nigeria — self-measure, pay by card, ship to them.",
    namePlaceholder: "Order for Chidinma — London",
    payerMode: "each_pays",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, welcome — let's get your measurements for your order abroad.",
    isContract: false,
  },
  {
    jobType: "remote_individual",
    label: "One client, remote",
    description: "A single client who can't come in — send one measure-and-pay link.",
    namePlaceholder: "Order for Blessing",
    payerMode: "each_pays",
    collectionMode: "measurements",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, welcome — let's get your measurements sorted remotely.",
    isContract: false,
  },
  {
    jobType: "ready_to_wear",
    label: "Pre-order a collection",
    description: "Buyers pick a size and quantity from a small catalogue and pay upfront.",
    namePlaceholder: "December collection pre-order",
    payerMode: "each_pays",
    collectionMode: "sizes",
    pricingMode: "flat",
    turnaroundMode: "standard",
    guestWelcomeLine: "Hi {name}, welcome — pick your size to pre-order.",
    isContract: false,
  },
];

const DEFAULT_TEMPLATE = JOB_TEMPLATES[0] as JobTemplate;

export function jobTemplate(jobType: string | null | undefined): JobTemplate {
  return JOB_TEMPLATES.find((t) => t.jobType === jobType) ?? DEFAULT_TEMPLATE;
}

export function guestWelcomeLine(jobType: string | null | undefined, firstName: string): string {
  return jobTemplate(jobType).guestWelcomeLine.replace("{name}", firstName);
}
