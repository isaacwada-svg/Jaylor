import { BrandedEmail } from "./brand-layout";
import type { TemplateEntry } from "./registry";

interface Props {
  subject?: string;
  body?: string;
  storeName?: string;
}

const Email = ({ subject, body, storeName }: Props) => (
  <BrandedEmail
    previewText={subject ?? "Bank transfer received"}
    heading={subject ?? "Bank transfer received"}
    body={body}
    storeName={storeName}
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data["subject"] || "Bank transfer received",
  displayName: "Transfer received alert",
  previewData: {
    subject: "Transfer received — ₦15,000",
    body: "₦15,000 received from Ada for order #1042. Balance now ₦5,000.",
    storeName: "Demo Tailoring",
  },
} satisfies TemplateEntry;
