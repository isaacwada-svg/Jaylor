import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "jaylor:visitor-id";

function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export async function trackEvent(eventName: "landing_view" | "signup_completed", userId?: string) {
  try {
    await supabase.from("analytics_events").insert({
      event_name: eventName,
      visitor_id: visitorId(),
      user_id: userId ?? null,
    });
  } catch {
    // Analytics is best-effort and must never interrupt the product flow.
  }
}