import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Browser security headers on every server response. Framing is limited to
// our own site and the Lovable editor preview (DENY would break the preview).
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const res = (result as { response?: Response }).response;
  if (res instanceof Response) {
    try {
      const h = res.headers;
      h.set("X-Content-Type-Options", "nosniff");
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      h.set("Referrer-Policy", "strict-origin-when-cross-origin");
      h.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
      const dev = import.meta.env.DEV ? " ws: http://localhost:*" : "";
      h.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://js.paystack.co",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co${dev}`,
          "frame-src 'self' https://*.paystack.co https://checkout.paystack.com",
          "worker-src 'self' blob:",
          "form-action 'self' https://*.paystack.co",
          "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
          "object-src 'none'",
          "base-uri 'self'",
        ].join("; "),
      );
    } catch {
      // immutable headers (e.g. proxied responses) — skip
    }
  }
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
