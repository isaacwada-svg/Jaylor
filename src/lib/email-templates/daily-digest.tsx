import { BrandedEmail } from "./brand-layout";
import type { TemplateEntry } from "./registry";

interface Props {
  subject?: string;
  body?: string;
  storeName?: string;
}

const Email = ({ subject, body, storeName }: Props) => (
  <BrandedEmail
    previewText={subject ?? "Your Jaylor digest"}
    heading={subject ?? "Your Jaylor daily digest"}
    body={body}
    storeName={storeName}
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data["subject"] || "Your Jaylor daily digest",
  displayName: "Daily digest",
  previewData: {
    subject: "Your shop today",
    body: "Good morning!\n\n3 orders in progress, 1 awaiting collection.",
    storeName: "Demo Tailoring",
  },
} satisfies TemplateEntry;
