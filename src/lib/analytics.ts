import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "jaylor:visitor-id";
const UTM_SOURCE_KEY = "jaylor:utm-source";

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

/** Last-touch utm_source: a fresh ?utm_source= in the URL overwrites what's
 *  stored, so whichever channel (TikTok, Telegram, IG...) brought this visit
 *  wins. Falls back to whatever was captured on an earlier visit, so a
 *  signup days after the first click still carries its source. */
function utmSource(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search)
      .get("utm_source")
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
    if (fromUrl) {
      window.localStorage.setItem(UTM_SOURCE_KEY, fromUrl);
      return fromUrl;
    }
    return window.localStorage.getItem(UTM_SOURCE_KEY);
  } catch {
    return null;
  }
}

export async function trackEvent(eventName: "landing_view" | "signup_completed", userId?: string) {
  try {
    await supabase.from("analytics_events").insert({
      event_name: eventName,
      visitor_id: visitorId(),
      user_id: userId ?? null,
      utm_source: utmSource(),
    });
  } catch {
    // Analytics is best-effort and must never interrupt the product flow.
  }
}
