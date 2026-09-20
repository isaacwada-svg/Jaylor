// Shared auth guard for edge functions that should only run for signed-in
// shop staff. Edge functions default to verify_jwt = false, so each handler
// has to validate the bearer token itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthedUser = { id: string; email: string | null };

/**
 * Validates the request's Authorization bearer token against Supabase Auth.
 * Returns the user, or null when the token is missing/invalid.
 */
export async function getRequestUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
