// Fired by the AI gateway (never by a client) the first time the global
// monthly AI budget crosses 80% or 100%. Email delivery works once a
// RESEND_API_KEY secret is added; WhatsApp delivery needs its own Business
// API account and is not wired up yet — until then the alert is still
// recorded (app_settings) and visible on the admin AI usage screen, so
// nothing is silently missed even with no secrets configured.
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/ai.ts";

type RequestBody = { threshold: 80 | 100; pctUsed: number };

// Mirrors src/lib/email-templates/brand-layout.tsx's navy/gold chrome --
// this edge function runs in Deno, separate from the Node app, so it can't
// import that React Email component directly; kept in sync by hand.
function brandedHtml(subject: string, body: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:32px 16px;background:#f2eee3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" align="center" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #c9a24b33;">
<tr><td style="background:#111f39;padding:22px 28px;">
<table role="presentation"><tr>
<td style="width:48px;"><img src="https://jaylor.com.ng/logo-mark.png" width="40" height="40" alt="Jaylor" style="display:block;border-radius:8px;" /></td>
<td><p style="margin:0;font-size:19px;font-weight:700;color:#faf7ef;line-height:22px;">Jaylor</p>
<p style="margin:2px 0 0;font-size:11px;color:#c9a24b;letter-spacing:0.04em;">CRAFTED FOR YOU</p></td>
</tr></table>
</td></tr>
<tr><td style="height:3px;background:#c9a24b;"></td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:19px;font-weight:700;color:#111f39;">${subject}</h1>
<p style="margin:0 0 6px;font-size:14px;line-height:23px;color:#333333;">${body}</p>
</td></tr>
<tr><td style="padding:18px 28px 26px;">
<hr style="border:none;border-top:1px solid #ece6d6;margin:8px 0 16px;" />
<p style="margin:0 0 4px;font-size:12px;line-height:19px;color:#9a9280;">Jaylor platform alert</p>
</td></tr>
</table>
</body></html>`;
}

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
      html: brandedHtml(subject, body),
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
