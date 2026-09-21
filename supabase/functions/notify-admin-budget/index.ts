// Fired by the AI gateway (never by a client) the first time the global
// monthly AI budget crosses 80% or 100%. Email delivery works once a
// RESEND_API_KEY secret is added; WhatsApp delivery needs its own Business
// API account and is not wired up yet — until then the alert is still
// recorded (app_settings) and visible on the admin AI usage screen, so
// nothing is silently missed even with no secrets configured.
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";

type RequestBody = { threshold: 80 | 100; pctUsed: number };

async function sendAdminEmail(threshold: number, pctUsed: number) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("AI_BUDGET_ADMIN_EMAIL");
  if (!apiKey || !adminEmail) return { sent: false, reason: "RESEND_API_KEY or AI_BUDGET_ADMIN_EMAIL not configured" };

  const subject =
    threshold >= 100
      ? "Jaylor: monthly AI budget fully used"
      : "Jaylor: monthly AI budget at 80%";
  const body =
    threshold >= 100
      ? `The global monthly AI budget has been fully used (${Math.round(pctUsed * 100)}%). AI features are now paused for free-plan shops, and for paid shops except voice order entry.`
      : `The global monthly AI budget has reached 80% (${Math.round(pctUsed * 100)}%). AI features will pause for free-plan shops until next month unless the budget is raised.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Jaylor <alerts@jaylor.app>",
      to: [adminEmail],
      subject,
      text: body,
    }),
  });
  return { sent: res.ok, reason: res.ok ? null : `Resend request failed (${res.status})` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  if (body.threshold !== 80 && body.threshold !== 100) return errorResponse("threshold must be 80 or 100");

  const email = await sendAdminEmail(body.threshold, body.pctUsed);
  return jsonResponse({
    email,
    whatsapp: { sent: false, reason: "WhatsApp Business API not yet connected for this project" },
  });
});
