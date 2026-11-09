import { BrandedEmail } from "./brand-layout";
import type { TemplateEntry } from "./registry";

interface Props {
  subject?: string;
  body?: string;
}

const Email = ({ subject, body }: Props) => (
  <BrandedEmail
    previewText={subject ?? "Jaylor platform alert"}
    heading={subject ?? "Jaylor platform alert"}
    body={body}
    storeName="the Jaylor platform"
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data["subject"] || "Jaylor platform alert",
  displayName: "Platform admin alert",
  previewData: {
    subject: "New signup: Ada's Fashion House",
    body: "A new store signed up.\n\nStore: Ada's Fashion House\nCity: Lagos\nOwner: ada@example.com\nWhen: just now",
  },
} satisfies TemplateEntry;
