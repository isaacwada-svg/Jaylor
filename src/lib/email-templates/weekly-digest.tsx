import { BrandedEmail } from "./brand-layout";
import type { TemplateEntry } from "./registry";

interface Props {
  subject?: string;
  body?: string;
  storeName?: string;
}

const Email = ({ subject, body, storeName }: Props) => (
  <BrandedEmail
    previewText={subject ?? "Your Jaylor weekly digest"}
    heading={subject ?? "Your Jaylor weekly digest"}
    body={body}
    storeName={storeName}
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data["subject"] || "Your Jaylor weekly digest",
  displayName: "Weekly digest",
  previewData: {
    subject: "Your week at the shop",
    body: "12 orders completed this week. 5 awaiting collection.",
    storeName: "Demo Tailoring",
  },
} satisfies TemplateEntry;
