/**
 * Every metered feature key in one place, so new features (Prompts 2-12)
 * register a label here instead of hardcoding limits in feature code.
 * The numeric limits themselves live in `plans.limits` (DB-editable by
 * an admin without a deploy) — this file only holds display metadata.
 */
export const FEATURE_LABELS: Record<string, string> = {
  orders: "Orders this month",
  whatsapp_auto: "Automatic WhatsApp messages",
  storefront_items: "Storefront items",
  users: "Team members",
  voice_entry: "Voice order entries",
  chat_import: "WhatsApp chat imports",
  notebook_pages: "Notebook pages scanned",
  fabric_calc: "Fabric calculator uses",
  style_cards: "Style cards created",
  ai_replies: "AI replies sent",
  events_active: "Active group events",
  order_photos: "Photos per order",
  branches: "Branches",
};
