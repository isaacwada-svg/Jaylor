# Jaylor Security Audit

**Repo:** `/home/user/remix-of-jaylor` · **Live:** jaylor.com.ng · **Date:** 21 September 2026

This report combines two independent audit passes run in parallel: **Track A**
(code-visible findings, run by Claude against the repository with no live
database access) and **Track B** (live-database findings, run by Lovable's AI
directly against the Supabase project). Neither track changed any code, policy,
setting, grant, bucket, or row — both are audit-only, per the two-phase process
this was requested under.

## ✅ L1 (Critical) — fixed and confirmed closed

**Any signed-in store owner could grant themselves any paid plan, an
unlimited trial, or reassign their store to another account, in one
request — a complete, silent bypass of every plan gate and paid feature in
the product.** See **L1** in Track B below for the full detail. Fixed via a
`BEFORE UPDATE` trigger on `stores` (`public.prevent_unauthorized_stores_update`
+ `stores_guard_sensitive_columns`, tracked in migration
`20260921125959_...sql`) blocking changes to the eight sensitive columns
unless the request runs as `service_role` or a platform admin.

The first version of this fix had a real bug, caught during the store
operator's own test run: `auth.role() = 'service_role'` returns `NULL`
(not `false`) whenever there is no JWT context at all, and that `NULL`
propagated through `OR`/`NOT` into the trigger's `IF` condition, which
plpgsql treats as "not true" — silently letting the write through instead
of blocking it. Patched by wrapping both guard checks in
`COALESCE(..., false)` so an unknown caller fails closed. Verified live:
`UPDATE stores SET plan_code = 'business' WHERE id = '<a real store>'`
now raises `42501: Not authorized to change plan, trial, active status,
ownership, referral, country or currency fields directly`, while
`UPDATE stores SET bio = '...'` on the same row still succeeds. The store
used for testing had its `plan_code` restored to its pre-test value
(`free`) afterward.

L2–L4 (also High/Critical) are still open and recommended next.

---

# Track A — Code-visible findings (Claude)

**Repo:** `/home/user/remix-of-jaylor` · **Live:** jaylor.com.ng · **Date:** 2026-09-21

## Scope and a critical caveat

This track covers only sections **2, 3, 4 (partial), 6, 7 (partial), 8, 9, 10** of
the larger audit spec, using only what is readable in this repository:
TypeScript/TSX application code, TanStack server functions, Supabase edge
functions (Deno), and the **tracked** SQL migrations under
`supabase/migrations/`. Section 6 (AI gateway) was audited directly by the
session that built that code, so its verification is first-hand rather than
inferred from reading someone else's code. Sections **1, 4 (payout/RLS), 5, 7
(bucket policies), 11, 12** are not covered at all: they require a live
database connection (RLS policy dump, actual grants, table definitions) that
this session does not have.

**Scope constraint discovered during this audit:** the tracked migrations only
go back to **2026-09-20/21** — a narrow, recent slice of DDL (column additions,
policy tweaks, grant tightening). The *original* schema — `CREATE TABLE` for
`event_participants`, `measurement_passports`, `orders`, `clients`, etc., the
bulk of the RLS policies, and most RPC function bodies (`get_participant_by_token`,
`set_participant_style`, `set_participant_measurement_choice`,
`check_feature_limit`, `can_use_feature`, `effective_plan_code`,
`increment_usage_counter`, `admin_store_ai_usage`, `admin_store_message_usage`,
and others) — was **never committed as a migration**. Every finding below that
depends on one of those bodies is marked "cannot verify" rather than guessed.
One live-confirmed fact is treated as given per the task brief: both storage
buckets (`ai-design-photos`, `storefront-photos`) have `public = false`.

Positive context: git history shows several prior remediation passes already
landed (commit messages "Fixed 3 security findings", "Fixed auth security
findings", "Merge Lovable's security fixes", "Merge Lovable's auth security
fix"), and the tracked migrations show a deliberate grant-tightening pass
(revoking `EXECUTE` on sensitive RPCs from `anon`/`authenticated`, restricting
`ai-design-photos` to member-only reads, column-scoping the `stores` table for
`anon`). Several of this report's items reflect gaps *around* those good
controls, not inside them.

---

## Section 2 — Public links and tokens

**A1 — Token generation for guest links cannot be verified from tracked migrations.**
Severity: **Cannot verify — RPC/table body not in tracked migrations.**
`event_participants.token` (used by `src/routes/e.$token.tsx`) and
`measurement_passports.token` (used by `src/routes/passport.$token.tsx`) are
both referenced only as plain string columns in application code
(`src/lib/jobs.functions.ts`, `src/lib/passport.functions.ts`); their table
definitions, defaults, and lengths are not in any tracked migration. I cannot
confirm they are `gen_random_uuid()`-backed (122-bit) rather than something
shorter/sequential. `src/lib/passport.functions.ts` enforces `token` length
20–200 chars server-side (zod), and `jobs.functions.ts` enforces 10–200, which
is at least consistent with a UUID-length token, but this is not proof of
entropy. **To verify:** dump `\d event_participants` / `\d measurement_passports`
and confirm the `token` column's default expression.

**A2 — No endpoint lists/searches tokens; all guest lookups require the exact token.**
Severity: **None — verified OK.** Every guest-facing read (`getJobExtras`,
`getJobQuote`, `getMeasuringSessions`, `getPassportByToken`, `get_participant_by_token`
RPC) filters by `.eq("token", data.token)` / `p_token`, never a partial match,
list, or search. `book.$handle.tsx` and `$handle.tsx` look up stores by `slug`
(a human-chosen handle, not a secret), which is by design public and not a
token.

**A3 — Direct client RPC calls bypass the app's rate-limiting layer.**
Severity: **Medium.** `src/routes/e.$token.tsx` calls
`supabase.rpc("get_participant_by_token", ...)`, `supabase.rpc("set_participant_style", ...)`,
and `supabase.rpc("set_participant_measurement_choice", ...)` **directly from
the browser** (lines 98, 166–169, 182–185), not through a TanStack server
function. Every other guest-facing mutation in this app (`setParticipantSize`,
`setMeasuringSession`, `acceptJobQuote` in `src/lib/jobs.functions.ts`; every
handler in `src/lib/passport.functions.ts`) goes through a server function that
calls `check_rate_limit` first (30 requests / 60 min, keyed on the token).
These three RPCs get none of that — whatever throttling they have, if any, is
inside the RPC body itself, which is one of the live-only, unverifiable
functions. Given tokens are (probably) high-entropy, the main risk isn't
brute-forcing the token itself but unbounded repeated writes/reads once a
token is known (e.g., a shared/leaked group-order link being hammered).
**Fix:** route these three calls through a server function with the same
`check_rate_limit` gate used elsewhere, for consistency and defense in depth.
**Cannot verify:** whether `get_participant_by_token` et al. already rate-limit
internally — their bodies are not tracked.

**A4 — Guest page data shape is scoped to one participant/store, as far as is visible.**
Severity: **None — verified OK** (for the parts that are visible) /
**Cannot verify** (for the RPC's actual `SELECT`). The TanStack server
functions in `jobs.functions.ts` and `passport.functions.ts` each `.select()`
only the specific narrow column list needed (e.g.
`"event_id, size_key, is_sponsored"`, `"name, logo_url, city, whatsapp_phone"`),
never `select("*")` on a guest-facing path, and never return sibling
participants' data (all queries are scoped `.eq("token", data.token)` or
`.eq("event_id", participant.event_id)` for aggregate counts only — e.g.
`getMeasuringSessions` returns booked-slot *counts*, not other participants'
names/phones). `get_participant_by_token`'s actual return shape is defined by
its (untracked) SQL body; the frontend's `GuestData` type only tells us what
the client *expects*, not what the RPC actually returns. **To verify:** read
the live function body and confirm its `RETURNS` shape matches.

**A5 — `stores_public` exposure to anonymous visitors is column-scoped, confirmed by migration.**
Severity: **None — verified OK.**
`supabase/migrations/20260920210002_bf845f4a-....sql` shows:
```sql
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (id, name, slug, logo_url, accent_color, city, cover_url, bio,
              whatsapp_phone, opening_hours) ON public.stores TO anon;
CREATE POLICY stores_select_public ON public.stores FOR SELECT TO anon
  USING (is_active = true);
```
and `supabase/migrations/20260920182353_d5ea4b0e-....sql` sets
`ALTER VIEW public.stores_public SET (security_invoker = true);` — meaning the
view runs with the *querying* role's privileges, so an anon query against
`stores_public` (used by `book.$handle.tsx` and `$handle.tsx`) is bound by that
same column allowlist even though the view itself does `select("*")` in the
frontend. No payment/staff/internal columns are exposed to anon by this path.

**A6 — Public write endpoints (`consultation_requests`, `sew_requests`) are scoped and DB-rate-limited, but the trigger attachment can't be confirmed from tracked migrations.**
Severity: **Low / Cannot fully verify.**
`supabase/migrations/20260921063245_c01a9092-....sql` shows a properly scoped
INSERT policy for `consultation_requests` (`status = 'pending' AND
consultation_id IS NULL AND` store must be `is_active`). Two rate-limit
enforcement functions exist — `enforce_consultation_request_rate_limit()` and
`enforce_sew_request_rate_limit()` — and their direct `EXECUTE` is revoked
from `anon`/`authenticated`/`PUBLIC` (only `service_role` in
`supabase/migrations/20260920182353_....sql`), which is consistent with them
being used as `BEFORE INSERT` triggers (triggers run as the table owner
regardless of grants). **However, no tracked migration contains the actual
`CREATE TRIGGER ... EXECUTE FUNCTION enforce_..._rate_limit()` statement**, so
I cannot confirm from the repo alone that these functions are actually wired
up to the tables rather than orphaned. **To verify:** `\d consultation_requests`
/ `\d sew_requests` live, and check `pg_trigger`.

---

## Section 3 — Authentication

**A7 — Phone-based login lookup (`resolveLoginEmail`) is a user-enumeration oracle with no rate limiting.**
Severity: **Medium.** `src/lib/auth-lookup.functions.ts` exposes
`resolveLoginEmail`, called from `src/routes/auth.tsx` (line 181) when a user
signs in with a WhatsApp number instead of an email. It returns
`{ email: string | null }` — non-null only if the phone is registered. The
frontend then shows an explicit, different message ("We couldn't find an
account with that WhatsApp number") when it's null. This is a working,
distinguishable oracle for "is this Nigerian phone number registered on
Jaylor" — and there is **no `check_rate_limit` call or any other throttling**
on this server function, unlike every guest-token endpoint reviewed in
Section 2. An attacker can script phone-number sweeps (Nigerian mobile number
space is large but structured/predictable in blocks) with no server-side
brake. The code comment even states the intent was to *avoid* enumeration,
but the implementation still leaks a binary yes/no via the reachable
`resolvedEmail` truthiness. Impact is bounded (reveals phone-is-registered,
not the email itself, and not the password), but it's a real, fixable gap.
**Fix:** add `check_rate_limit` (per phone and per IP) to `resolveLoginEmail`,
and/or consider intentionally slow, generic responses matching the
non-enumerating design intent stated in the code comment.

**A8 — Password rules are enforced client-side only in this codebase; server-side policy is Supabase Auth dashboard config, not visible here.**
Severity: **Cannot verify (dashboard config) / Low (as coded).**
`src/routes/auth.tsx` sets `minLength={10}` (signup) / `minLength={8}` (reset)
on the `<PasswordInput>` — an HTML attribute only, trivially bypassed by
posting directly to Supabase Auth's API. Supabase Auth itself enforces its own
server-side minimum (configurable in the dashboard, default is low, e.g. 6
chars) independent of this code. **To verify:** check the Supabase Auth
dashboard's password policy (minimum length, required character classes,
leaked-password protection) — not visible in this repo.

**A9 — Login/signup rate limiting is Supabase Auth's own (dashboard-configured), not implemented in this app's code.**
Severity: **Cannot verify.** No custom throttling wraps
`signInWithPassword`, `signUp`, or `resetPasswordForEmail` in
`src/routes/auth.tsx`. Supabase Auth has built-in rate limits for these
operations, but their configuration lives in the Supabase project dashboard,
not in this repo. **To verify:** check Auth → Rate Limits in the Supabase
dashboard.

**A10 — Signup/reset enumeration via response differences is a Supabase Auth platform behavior, not app code.**
Severity: **Cannot verify.** `supabase.auth.signUp()` and
`resetPasswordForEmail()` are called with no extra wrapping in
`auth.tsx`; whether Supabase Auth's "Confirm email" setting is configured to
suppress the "already registered" signal (its documented anti-enumeration
behavior) is a dashboard setting, not code in this repo.

**A11 — Google OAuth redirect allowlisting is Supabase/Google dashboard config, not in-repo.**
Severity: **Cannot verify.** `handleGoogle()` in `auth.tsx` calls
`lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
(`src/integrations/lovable/index.ts`, auto-generated, not to be edited). The
`redirect_uri` passed is always `window.location.origin` — **not** attacker
influenced by any URL query parameter — so there is no app-level open-redirect
risk in this call. Whether Google/Supabase enforce a redirect-URI allowlist on
their side is dashboard configuration outside this repo.

**A12 — No open-redirect via `redirect`/`next`/`returnTo` query params found.**
Severity: **None — verified OK.** Grepped the whole `src/` tree for
`window.location.href =`, `window.location.assign`, `window.location.replace`,
`redirectTo`, `redirect_uri`, `returnTo`, `next=`. Every navigational
assignment found is either (a) `window.location.origin`-derived (auth.tsx:96,
205 — not attacker-controlled), or (b) an `authorization_url` returned **from
Jaylor's own edge function**, which in turn is Paystack's own checkout URL
(`create-design-payment`, `create-order-payment`, `create-message-topup`
responses) — never a client-supplied URL. No route reads a `redirect`/`next`/
`returnTo` search param and feeds it into a navigation call.

---

## Section 4 (partial) — Payment webhook and payment edge functions

**A13 — `paystack-webhook` verifies the signature correctly before trusting the payload.**
Severity: **None — verified OK.**
`supabase/functions/paystack-webhook/index.ts` reads the raw body first
(`req.text()`), then calls `isValidWebhookSignature(rawBody, signature)`
(`supabase/functions/_shared/paystack.ts:111-125`), which computes
`HMAC-SHA512(PAYSTACK_SECRET_KEY, rawBody)` and compares the hex digest to the
`x-paystack-signature` header. An invalid/missing signature returns
`401 Invalid signature` before the body is even parsed as JSON. This matches
Paystack's documented verification scheme.

**A14 — Signature comparison is a plain string equality, not constant-time.**
Severity: **Low/Info.** `isValidWebhookSignature` (`_shared/paystack.ts:124`)
does `return hex === signature;` — a standard JS `===`, which short-circuits
on the first differing byte. This is a theoretical timing side-channel on a
512-bit MAC; exploiting it over the network to forge a valid signature is not
practically feasible, but it's a one-line fix (constant-time compare) and
commonly flagged in this kind of audit. **Fix:** use a constant-time
byte-array comparison instead of `===` on the hex strings.

**A15 — Webhook crediting uses server-stored amounts, not client/webhook-supplied amounts — idempotent via status guard.**
Severity: **None — verified OK.** `confirmOrderPayment` in
`paystack-webhook/index.ts` (lines 54–82) looks up `order_payment_links` by
`reference` **and `status = 'pending'`**, and credits `link.amount` (the
amount stored when the link was created), never `event.data.amount` from the
Paystack payload. The subsequent `UPDATE ... WHERE status = 'pending'` means a
replayed webhook for an already-`success` reference updates zero rows and
inserts no duplicate `payments` row — this is idempotent by construction. The
same status-guard pattern is used for `message_topups` and
`ai_design_payments` in the same file. `verify-order-payment`,
`verify-message-topup`, and `verify-design-payment` follow the identical
pattern: they call Paystack's `transaction/verify` (server-to-server,
authoritative) and only then flip `status: 'pending' → 'success'`, crediting
the DB-stored amount, not anything from the request body.

**A16 — No edge function lets a client directly set an order/participant's paid/status fields without a verified payment record.**
Severity: **None — verified OK**, for every payment path reviewed
(`create-order-payment`, `verify-order-payment`, `create-design-payment`,
`verify-design-payment`, `create-message-topup`, `verify-message-topup`). All
status transitions to `success` happen only after either (a) the signed
webhook fires, or (b) a server-side call to Paystack's `verify` endpoint
returns `status === "success"`. None of these functions accept a client-sent
`status` or `paid` field.

**A17 — `create-order-payment` trusts a staff-supplied `amount`, but this is an authorized-staff-only invoicing action, not a public payment amount.**
Severity: **Low/Info.** `supabase/functions/create-order-payment/index.ts`
(lines 26, 88) takes `body.amount` from the request and uses it both for the
Paystack `amountKobo` and for the platform-fee calculation, after confirming
the caller is a signed-in `owner`/`manager` of the order's store
(lines 42–54). This is the intended behavior — staff choosing how much to
invoice a client for — not a guest-facing amount-tampering surface. Noted for
completeness only; no fix needed.

**A18 — `notify-admin-budget` has no authentication or shared secret and can be invoked by anyone.**
Severity: **Medium.** `supabase/functions/notify-admin-budget/index.ts` has no
`getRequestUser` call and no other check — its own top comment says "Fired by
the AI gateway (never by a client)" but nothing in the code enforces that.
Since Supabase edge functions default to `verify_jwt = false` (per the comment
in `_shared/auth.ts`), this endpoint is reachable by anyone who knows (or
guesses) the standard
`https://<project>.supabase.co/functions/v1/notify-admin-budget` URL, with no
rate limiting either. An attacker can repeatedly POST
`{"threshold": 100, "pctUsed": 1}` to spam the configured
`AI_BUDGET_ADMIN_EMAIL` inbox via Resend, at Jaylor's cost and to the admin's
annoyance, and could also falsely signal "AI budget exhausted" (though this
call alone doesn't change any budget state used by `canUseAi` — it only sends
an email). **Fix:** require a shared secret header (e.g. compare against an
env var only the gateway knows) or restrict via `verify_jwt = true` +
service-role-only invocation, and add `check_rate_limit`.

---

## Section 6 — AI Gateway (audited directly by the calling session; this code was authored in this session, so verification is first-hand, not inferred)

**S6-1 — Confirmed: every text/audio AI call goes through the single gateway.** `voice-order/index.ts` and `whatsapp-reply-draft/index.ts` both call `runAiGatewayCall` in `_shared/ai-gateway.ts`, which is the only code path that calls `_shared/ai.ts`'s `callAI`. No client-side code calls the Lovable AI Gateway URL directly, and `LOVABLE_API_KEY` is read only via `Deno.env.get` inside `_shared/ai.ts`, never embedded in any client bundle. Severity: None — verified OK.

**S6-2 — `generate-design` (image generation) does not go through the same gate as text calls.** It uses `gateAndLogImageCall`, which only checks the *global* budget threshold, not the per-store hourly/daily rate limit or the plan feature-quota check (`check_feature_limit`) that `runAiGatewayCall` enforces. It does have its own bespoke rate limiting (phone-based via `check_rate_limit`, IP-based, and a 40/day per-store cap on `ai_designs` rows), which mitigates the gap in practice, but the enforcement mechanism is inconsistent with the rest of the gateway and was a known, deliberate scoping decision when built, not an oversight caught late. Severity: Low (compensating controls exist). Fix: route it through `canUseAi`'s plan-quota + rate-limit checks too, or explicitly document why it's exempt.

**S6-3 — `generate-design`'s `storeId` is never validated against the `stores` table (independently confirmed — same root cause as Track A's A21).** File: `supabase/functions/generate-design/index.ts:69-74` (only checks the field is non-empty) and line 133 (`.eq("store_id", body.storeId)` used directly in a query with no prior existence check). Since this endpoint is intentionally public/unauthenticated (a storefront visitor generating a design preview), an attacker can pass an arbitrary UUID — a real store's ID they don't own, or a fake one — as `storeId`. Effect: (a) against a real store's ID, the request consumes that store's AI budget contribution, its 40/day design cap, and inserts `ai_designs` rows attributed to a store that never asked for it (nuisance/quota-griefing, not data exposure — the response returned to the attacker is still just their own generated image); (b) against a fake ID, an orphaned `ai_designs` row and an uploaded file under a nonexistent store's storage folder. Severity: Medium (real abuse vector, no data leak, capped blast radius by the existing rate limits). Fix: verify `body.storeId` exists and `is_active` in `stores` before proceeding.

**S6-4 — AI JSON output is not schema-validated before use.** `voice-order/index.ts:118`: `const parsed = blankLowConfidenceFields(JSON.parse(content));` — if the model returns valid JSON but with an out-of-range `garment_type` (not in the allowed list passed in the prompt), a non-numeric `price`, or a malformed `delivery_date`, none of that is checked before the object is returned to the client as `{result: parsed}`. Mitigating factor: the client always opens the pre-filled order form for the tailor to review and explicitly submit (`voice-order-dialog.tsx` → `onParsed(prefill)` → opens `OrderForm`, never auto-saves), so a human reviews every field before it reaches the database, and the order form's own inputs (a `Select` constrained to `GARMENT_TYPES`, a numeric price field) would reject or force-correct most bad values anyway. Severity: Low-Medium (defence in depth gap, not an exploitable path to unreviewed data corruption today, but worth closing — a future change that auto-applies AI output without review would inherit this gap silently). Fix: validate the parsed object against a strict shape (e.g. zod) server-side before returning it, rejecting or nulling any field that doesn't match, rather than trusting the model's adherence to the prompt's stated schema.

**S6-5 — Prompt injection surface is narrower than the original spec assumed.** The spec asks to check "text inside an imported WhatsApp chat, notebook photo or storefront message." As built today, there is no AI feature that reads an imported WhatsApp chat or a notebook photo at all — WhatsApp chat import and notebook import are both fully manual/human processes (a staff member retypes them; confirmed earlier in this project's build history), not AI-processed. The only free-text-to-AI paths are: the voice-order transcript/audio (a tailor's own dictation, not third-party-supplied content), the WhatsApp-reply-draft context (built from the tailor's own order/client data, no free third-party text except an optional pasted "incoming message" the tailor chooses to paste themselves), and the design-generation description (a customer's own style request, rendered back only as an image prompt, never executed as instructions with data-access consequences). None of these accept content from an unrelated third party that then gets *acted on* by the model with write access — the AI never has tool/function-calling access to the database at all, only returns text/JSON/an image for a human to review. Severity: Informational — the described risk class doesn't currently have a matching feature to attach to; revisit this note if notebook-photo OCR or WhatsApp-chat AI import is ever built.

**S6-6 — AI calls cannot read another store's data.** Both `voice-order` and `whatsapp-reply-draft` check `is_store_member(storeId)` against the caller's own auth token before doing anything else (`supabase.rpc("is_store_member", { _store_id: body.storeId })`), and the context/transcript passed into the model is only ever what the calling function explicitly assembled for that one request (never a broader query result). No cross-store data enters an AI call anywhere in this codebase. Severity: None — verified OK.

**S6-7 — Budget/rate-limit logic verified by code review, not live testing.** `canUseAi` in `_shared/ai-gateway.ts` checks plan quota (`check_feature_limit`), per-store hourly/daily counts against `usage_log`, and the global monthly budget (`app_settings.ai_monthly_budget_usd` vs. summed `usage_log.estimated_cost_usd`) before allowing any gateway call, in that order, failing closed (blocking) on quota/rate-limit breach and on budget breach (with an allowlist for `voice_entry` on paid plans at 100% budget). The admin-alert-at-80%/100% path uses `app_settings`'s primary-key uniqueness on the alert key (`ai_budget_alert_80_<month>` / `_100_<month>`) as a natural idempotency guard against firing the same alert twice under concurrent requests. I wrote and re-read this code carefully and it's logically sound, but I have not been able to exercise it against a live database with real concurrent traffic — flag as "verified by static review only" until it's been observed working in production (e.g. by checking `usage_log`/`app_settings` after a real near-threshold day). Severity: Informational.

---

## Section 7 (partial) — File uploads

*(Bucket `public = false` for both `ai-design-photos` and `storefront-photos`
is treated as already verified per the task brief; not re-derived here.)*

**A19 — `ai-design-photos` bucket: no public/anon read or insert; explicitly locked to store members, confirmed by migration.**
Severity: **None — verified OK.**
`supabase/migrations/20260920185252_458bae7a-....sql` drops
`ai_design_photos_public_read` / `ai_design_photos_public_insert` and replaces
them with `ai_design_photos_member_read`, `FOR SELECT TO authenticated USING
(bucket_id = 'ai-design-photos' AND is_store_member((split_part(name, '/', 1))::uuid))`
— i.e., only a signed-in member of the store whose ID is the first path
segment can read. Guests never get direct storage access; they only ever see
short-lived **signed URLs** minted server-side (`signPath` in
`generate-design/index.ts`, `getSharedDesign` in `design-photos.functions.ts`),
which is the correct pattern for a private bucket serving public-facing
content.

**A20 — Selfie upload path is validated to belong to the requesting store (`generate-design`), and only-JPEG format is asserted structurally.**
Severity: **None — verified OK**, with a caveat (see A22).
`supabase/functions/generate-design/index.ts` (lines 79–87) rejects any
`selfiePath` whose storage path doesn't start with `${body.storeId}/`.
`src/lib/design-photos.functions.ts`'s `uploadDesignSelfie` requires
`dataUrl` to match `^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$` (zod regex) and
caps size at 3 MB, uploading server-side (never letting the client write to
storage directly for this path).

**A21 — `generate-design` does not verify `storeId` corresponds to a real/existing store before writing AI-generated designs under it.**
Severity: **Medium.** `supabase/functions/generate-design/index.ts` never
queries `stores` to confirm `body.storeId` exists — it only checks that an
optional `selfiePath` is prefixed with that same client-supplied `storeId`
(self-consistent, but not validated against reality), then inserts into
`ai_designs` with `store_id: body.storeId` and writes the generated image to
`ai-design-photos/${storeId}/...`. Since this is an intentionally
unauthenticated, public-facing widget (any storefront visitor can use it
without login), and store IDs are visible in a store's own public page
data, a third party who knows another store's UUID could submit design
requests attributed to that store — consuming its 40/day design-generation
cap (line 135) and populating its owner's AI-designs dashboard
(`src/routes/_authenticated/ai-designs.tsx`) with spoofed
client name/phone/description. Impact is bounded (per-store daily cap, and
phone/IP rate limits of 5/hr and 8/hr respectively on the *requester* side —
lines 90–126), but it's a real quota-exhaustion / dashboard-pollution vector
against a specific competitor store. **Fix:** confirm `storeId` exists (and
perhaps `is_active`) before proceeding, same as other public endpoints already
do (e.g. `consultation_requests_insert_public`'s `EXISTS (... is_active = true)`
check).

**A22 — `resizeImageFile`'s silent fallback on decode failure can upload non-image bytes mislabeled as `image/jpeg`, in the one call site that doesn't double-check the result.**
Severity: **Medium.** `src/lib/image.ts`'s `resizeImageFile` calls
`createImageBitmap(file)`; if that throws (file isn't decodable as an image —
e.g., renamed non-image file, corrupt/malicious input), the `catch` block
returns **the original, unprocessed file** unchanged (line 29):
```ts
} catch {
  return file;
}
```
`src/components/jaylor/image-upload-field.tsx` (used for storefront item
photos, store logo/cover in `store-profile-settings.tsx`, and job-batch photos
in `job-batches-panel.tsx`) uploads the result with a **hardcoded**
`contentType: "image/jpeg"` (line 52) and never checks
`file.type === "image/jpeg"` after calling `resizeImageFile`. So a file that
fails to decode as an image is uploaded as-is, labeled `image/jpeg` regardless
of its real content. By contrast, `src/components/jaylor/ai-design-generator.tsx`
(lines 118–127) *does* guard this — it re-derives a `data:` URL via
`FileReader` and explicitly checks `dataUrl.startsWith("data:image/jpeg;base64,")`,
throwing if the fallback produced something else — so that call site is safe.
Only the `ImageUploadField` (storefront items / logo / cover / job-batch
photos, all authenticated-staff-only upload paths) has the gap. Real-world
impact is reduced because: the bucket is private (signed URLs only), the
stored `Content-Type` is forced to `image/jpeg` at upload (so a browser
serving it back would see that header, not the true type), and the app only
ever renders these via `<img src=...>` (never as a navigable link or iframe).
Still, this is exactly the "type validation by claimed MIME/extension, not
actual re-encoding" gap the audit asked about, and it's inconsistent between
call sites in the same codebase. **Fix:** in `ImageUploadField.handleFiles`,
verify `file.type === "image/jpeg"` after `resizeImageFile` and reject
otherwise (mirroring the `ai-design-generator.tsx` pattern), or make
`resizeImageFile` throw instead of silently falling back.

**A23 — No file uploads let an authenticated user write outside their own store's folder, as far as client code enforces — but the actual authorization boundary is bucket RLS, which is not in tracked migrations.**
Severity: **Cannot fully verify.** Every upload call site
(`image-upload-field.tsx:49`, `store-profile-settings.tsx:41`,
`job-batches-panel.tsx:155`) constructs the object path as
`${storeId}/${crypto.randomUUID()}.jpg`, where `storeId` is a React prop
threaded down from the currently-selected store in the dashboard UI — i.e., a
value the browser holds client-side and could in principle be tampered with
via devtools before the `supabase.storage.from(...).upload()` call fires. The
real security boundary has to be the **storage bucket's RLS policy** on
`storage.objects` requiring `is_store_member(split_part(name,'/',1)::uuid)`
for INSERT (the pattern already confirmed for `ai-design-photos` reads in
A19) — but no such INSERT policy for `storefront-photos` appears in any
tracked migration. **To verify:** dump the live RLS policies on
`storage.objects` for the `storefront-photos` bucket and confirm an
INSERT/UPDATE policy restricts the first path segment to a store the
authenticated user belongs to.

**A24 — `storefront-photos` signed-URL generation is callable by anonymous visitors, by design (public storefront), but object-level access control is DB-policy-dependent.**
Severity: **Cannot fully verify.** `src/lib/storefront-photos.ts`'s
`useStorefrontPhotoUrls` calls `supabase.storage.from(BUCKET).createSignedUrls(paths, ...)`
directly from the browser, and is used on the fully public `$handle.tsx` and
`book.$handle.tsx` routes (no login). This is expected for a public storefront
gallery. Whether the underlying SELECT policy on `storage.objects` for this
bucket is scoped per-store/per-published-item, or broad enough that any
visitor could mint a signed URL for **any** path in the bucket (including
another store's unpublished photos) if they knew/guessed the UUID-named path,
is DB-policy-dependent and not in tracked migrations. **To verify:** dump the
live RLS SELECT policy on `storage.objects` for `storefront-photos`.

---

## Section 8 — Input, output, web security

**A25 — `dangerouslySetInnerHTML` usage is all static/trusted content.**
Severity: **None — verified OK.** Two uses found in `src/`:
- `src/routes/__root.tsx:135,140` — a hardcoded CSS string (background color)
  and `THEME_BOOTSTRAP` (a fixed script constant), used to avoid a flash of
  unstyled/wrong-theme content before first paint. No user input involved.
- `src/components/ui/chart.tsx:72-89` — builds a `<style>` block from a
  `ChartConfig`'s `color`/`theme` values. Checked every call site
  (`src/routes/_authenticated/reports.tsx:464,465,511`): all colors are
  hardcoded CSS variable references (`"var(--color-gold)"` etc.), never
  user-supplied data. No injection surface.

**A26 — Input validation on edge functions is present everywhere reviewed, but inconsistent in strictness (manual checks vs. schema validation).**
Severity: **Low/Info.** Every edge function reviewed
(`create-order-payment`, `verify-order-payment`, `create-design-payment`,
`verify-design-payment`, `create-message-topup`, `verify-message-topup`,
`connect-payment-account`, `list-paystack-banks`, `paystack-webhook`,
`notify-admin-budget`, `generate-design`, `select-ai-design`, `voice-order`,
`whatsapp-reply-draft`) does `try { body = await req.json() } catch { return errorResponse(...) }`
followed by manual presence/type checks (`if (!body.x) return errorResponse(...)`)
before use — there is no bypass of required-field checks found. However, the
rigor varies: some functions bound-check numeric/string fields precisely
(`voice-order`'s `MAX_AUDIO_SECONDS`, `MAX_AUDIO_BASE64_BYTES`;
`design-photos.functions.ts`'s zod regex + byte-length cap), while others only
check truthiness (`create-order-payment`'s `!body.amount || body.amount <= 0`
is good, but e.g. `body.callbackUrl` is never validated as a same-origin URL
before being passed to Paystack as `callback_url` — Paystack itself will
redirect the user's browser there after payment, so an attacker-supplied
`callbackUrl` pointing off-site is plausible input to consider, though the
caller must already be an authenticated owner/manager for
`create-order-payment`/`create-message-topup`, and unauthenticated for
`create-design-payment` where nothing sensitive is appended to that URL
besides a `?reference=` on redirect). None of this rises to a concrete
exploit found in this review, but it's worth tightening for consistency.
**Fix:** adopt zod (already used in the TanStack server functions) uniformly
in edge functions too, including validating `callbackUrl` is same-origin.

**A27 — CORS is `Access-Control-Allow-Origin: *` on every edge function (single shared constant).**
Severity: **Low/Info**, as assessed in the audit brief. Confirmed:
`supabase/functions/_shared/ai.ts:20` defines
`CORS_HEADERS = { "Access-Control-Allow-Origin": "*", ... }`, and every
function imports this single constant (`grep` confirms no other
`Access-Control-Allow-Origin` definition anywhere in `supabase/functions/`).
For the guest-facing/unauthenticated functions (`create-design-payment`,
`verify-design-payment`, `select-ai-design`, `notify-admin-budget`) this is
fine — they're meant to be called from any page. For the bearer-token-gated
functions (`create-order-payment`, `verify-order-payment`,
`create-message-topup`, `verify-message-topup`, `connect-payment-account`,
`list-paystack-banks`, `voice-order`, `whatsapp-reply-draft`), a wildcard CORS
origin means any third-party website's JS could attempt a fetch with a
Jaylor user's bearer token if that token were somehow available to that
page's JS (it normally isn't — the token lives in Jaylor's own origin's
storage) — the real gate remains the `getRequestUser` bearer-token check,
so this is Low/Info as the brief anticipated, not independently exploitable
without another vulnerability that leaks the token to a third-party page.
**Fix (defense in depth):** scope `Access-Control-Allow-Origin` to
`https://jaylor.com.ng` (and any staging origin) for the authenticated
functions specifically.

**A28 — Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy are set; CSP is explicitly and deliberately not configured yet.**
Severity: **Low** (CSP gap), **None — verified OK** (for the other five headers).
`src/server.ts:52-64` sets, on every response including error pages:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
The code comment explicitly documents the CSP omission as an intentional,
tracked gap ("that would need a full Content-Security-Policy, which risks
breaking Supabase/Google Fonts/OAuth requests... deliberately left for a
follow-up with real end-to-end testing"). No `vite.config.ts` / nitro /
Cloudflare config adds headers beyond this (`vite.config.ts` only wires the
shared `@lovable.dev/vite-tanstack-config` preset and a custom server entry;
no `_headers`/`wrangler.toml` in the tracked source — the ones under
`.output/` and `.wrangler/` are build artifacts, not source). **Fix:** the
missing piece is CSP; given `X-Frame-Options: DENY` already blocks framing,
the highest-value next step is a `Content-Security-Policy` with
`frame-ancestors 'none'` plus explicit `script-src`/`connect-src` allowlists
for Supabase, Google Fonts, and Google OAuth, tested end-to-end before
shipping (as the comment already plans).

**A29 — Edge function error handling leaks raw Postgres/PostgREST error text to the client in several `catch` blocks.**
Severity: **Medium.** The common pattern
`catch (error) { return errorResponse(error instanceof Error ? error.message : "...", 500); }`
appears in `create-order-payment`, `create-design-payment`,
`create-message-topup`, `connect-payment-account`, `list-paystack-banks`,
`verify-order-payment`, `verify-design-payment`, `verify-message-topup`,
`voice-order`, `whatsapp-reply-draft`. Where the thrown value originates from
a Supabase insert/update failure (e.g. `if (error) throw error;` after
`supabase.from(...).insert(...)`), the caught object is a
**`PostgrestError`**, confirmed by reading
`node_modules/@supabase/postgrest-js/src/PostgrestError.ts:25` —
`export default class PostgrestError extends Error`. Since it extends `Error`,
`error instanceof Error` is `true` and `error.message` (the raw PostgREST/
Postgres message — e.g. a unique-constraint name, a column name, or an RLS
"permission denied" hint) is returned directly in the JSON response body.
This doesn't leak stack traces or file paths, and most of these paths already
require authentication, but it's still handing a caller more of the schema's
internal shape than necessary, and on the two unauthenticated payment-init
paths (`create-design-payment`, and Paystack's own API-error messages
generally) this text reaches an anonymous caller. **Fix:** in every edge
function's outer `catch`, log the full error server-side and return a fixed,
generic user-facing message; reserve `error.message` passthrough for
`Error` instances you throw yourself with an intentionally user-safe string
(as `paystack.ts`'s helper functions already do for Paystack API failures).

---

## Section 9 — Messaging

**A30 — All WhatsApp sends are client-side `wa.me` deep links from fixed template functions, opened by a signed-in staff member's own browser; this is a materially different risk profile from a server-side send.**
Severity: **None — verified OK**, with one nuance noted.
`src/lib/whatsapp.ts`'s `whatsappLink(phone, message)` only builds a
`https://wa.me/<digits>?text=<encoded>` URL — there is no server-side sending
capability anywhere in this codebase (confirmed: `notify-admin-budget` sends
email via Resend, not WhatsApp; its own comment says "WhatsApp delivery needs
its own Business API account and is not wired up yet"). Grepped every call
site (18 usages across routes/components): the overwhelming majority pass
`message` built from one of the three fixed template functions
(`orderReadyMessage`, `balanceDueMessage`, `seasonAlertMessage`) or an
inline static string with interpolated data fields (names, amounts, dates) —
never a template *name* selected by attacker input, and never sent to a
recipient chosen by anyone other than the clicking staff member's own UI
context (the target `phone` is always the store's own configured
`whatsapp_phone` on guest pages, or the specific client's stored phone on
staff pages). One exception worth flagging precisely:
`src/components/jaylor/ai-reply-draft-button.tsx` builds its message from an
AI-drafted reply (via the `whatsapp-reply-draft` edge function) rather than
one of the four fixed templates — but the draft is rendered in an editable
`<Textarea>` (lines 102–110) and only sent when staff clicks "Send on
WhatsApp" after reviewing/editing it, so it's still a human-reviewed,
human-initiated client-side deep link, not an automated or attacker-triggered
send.

**A31 — A store's own `whatsapp_phone`, or a booking/consultation's client-supplied phone, could in principle be set to any valid Nigerian number, but the "attack" is limited to a human staff member choosing to click a link addressed to it.**
Severity: **Low/Info.** `book.$handle.tsx` inserts a
`consultation_requests` row with an attacker-controlled `phone` (validated
only for Nigerian-number *format* via `normalizePhoneNG`, not ownership) and
`name`. If a staff member later uses a "remind"/"confirm" action referencing
that request, the resulting `wa.me` link is addressed to whatever phone was
submitted, with the submitted name interpolated into a fixed template. In the
worst case this lets an attacker get a real tailor's WhatsApp Business
account to send one templated message to an arbitrary third party's real
number, under a fabricated "client" name — a mild spam/social-engineering
vector, but bounded to Jaylor's own fixed message templates (no free-text
injection into the message body) and requires a human staff member to
actively click send. This is inherent to any public lead-gen/booking form and
not specific to a Jaylor implementation flaw; noting it because the audit
brief asked to check specifically for it.

**A32 — `notify-admin-budget` (server-initiated email) — see A18.** Already
covered under Section 4/8 above: no auth, no rate limit, callable by anyone.

---

## Section 10 — Secrets, dependencies

**A33 — No hardcoded API keys/secrets found on HEAD or in tracked git history.**
Severity: **None — verified OK.** Ran
`git grep` for `sk_live_`, `sk_test_`, `AKIA[0-9A-Z]{16}`,
`SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]`, `LOVABLE_API_KEY\s*=\s*['"]`,
`RESEND_API_KEY\s*=\s*['"]`, `sb_secret_...` across the working tree: zero
matches. Ran the same pattern set against `git log --all -p` (full history,
173 commits): zero matches. `.env` (tracked) contains only
`SUPABASE_PROJECT_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` (value
begins `sb_publishable_...`) — the new-format Supabase **publishable** key,
confirmed non-secret by design. No `SUPABASE_SERVICE_ROLE_KEY`,
`PAYSTACK_SECRET_KEY`, `LOVABLE_API_KEY`, or `RESEND_API_KEY` appears anywhere
in tracked files.

**A34 — Client bundle uses the anon/publishable key only; service role key is server-only and pulled exclusively from environment variables.**
Severity: **None — verified OK.**
`src/integrations/supabase/client.ts` (ships to the browser) reads
`VITE_SUPABASE_PUBLISHABLE_KEY` — matches the `sb_publishable_` value in
`.env`. `src/integrations/supabase/client.server.ts` (server-only, its own
comment states "route files and *.functions.ts ship to the client bundle" so
this file must not be imported from them at module scope) reads
`process.env['SUPABASE_SERVICE_ROLE_KEY']`, never a literal. Every one of the
12 edge functions under `supabase/functions/*/index.ts` that needs elevated
access calls `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` — confirmed via
`grep`, zero literal service-role keys found in any function file.

**A35 — `npm audit` reports zero vulnerabilities.**
Severity: **None — verified OK (at time of audit).**
`npm audit --omit=dev` and plain `npm audit` (against the tracked
`package-lock.json`, 267-package `node_modules` present, `npm ls --depth=0`
resolves cleanly) both report `found 0 vulnerabilities`. No high/critical (or
any-severity) advisories flagged. This reflects the dependency tree as locked
right now; re-run periodically as new CVEs are published against currently
"clean" packages.

---

## Summary table (sorted by severity)

| ID | Area | Severity | One-line summary |
|----|------|----------|-------------------|
| A7 | Auth | Medium | `resolveLoginEmail` is an unrate-limited phone-number user-enumeration oracle |
| A18 | Payments/Messaging | Medium | `notify-admin-budget` has no auth/rate-limit — anyone can trigger admin email spam |
| A21 | File uploads | Medium | `generate-design` never validates `storeId` exists — lets a third party pollute/exhaust another store's AI-design quota |
| A22 | File uploads | Medium | `resizeImageFile`'s decode-failure fallback can upload non-image bytes mislabeled `image/jpeg` (one call site lacks the type re-check another has) |
| A29 | Web security | Medium | Raw `PostgrestError.message` (schema-revealing DB error text) returned to clients in many edge-function `catch` blocks |
| A3 | Public tokens | Medium | Three guest RPCs (`get_participant_by_token`, `set_participant_style`, `set_participant_measurement_choice`) bypass the app's rate-limiting layer used everywhere else |
| S6-3 | AI gateway | Medium | `generate-design`'s `storeId` never validated to exist (same finding as A21, confirmed independently) |
| S6-2 | AI gateway | Low | `generate-design` bypasses the main gateway's plan-quota/rate-limit checks (has its own compensating controls) |
| S6-4 | AI gateway | Low-Medium | AI JSON output not schema-validated server-side before returning to client (human review before save is the compensating control) |
| A14 | Payments | Low/Info | Webhook signature compared with `===`, not constant-time |
| A17 | Payments | Low/Info | Staff-supplied invoice `amount` — expected behavior, not a vuln |
| A26 | Web security | Low/Info | Edge-function input validation present but inconsistently strict; `callbackUrl` not verified same-origin |
| A27 | Web security | Low/Info | `Access-Control-Allow-Origin: *` on all functions, including bearer-token-gated ones (bearer check is the real gate) |
| A28 | Web security | Low | CSP intentionally not yet configured (five other security headers are set correctly) |
| A31 | Messaging | Low/Info | Attacker-supplied booking phone could get a fixed WhatsApp template sent to an arbitrary third party — inherent to any public form, template-only, human-click-gated |
| A6 | Public tokens | Low/Cannot verify | Rate-limit trigger functions exist and are execute-locked to service_role, but their `CREATE TRIGGER` attachment isn't in tracked migrations |
| A1 | Public tokens | Cannot verify | `event_participants.token` / `measurement_passports.token` generation scheme not in tracked migrations |
| A4 | Public tokens | Cannot verify (partial) | `get_participant_by_token`'s actual `SELECT` shape not verifiable (body untracked); visible server-function code is properly scoped |
| A8 | Auth | Cannot verify | Password policy server-side enforcement is Supabase Auth dashboard config |
| A9 | Auth | Cannot verify | Login/signup/reset rate limiting is Supabase Auth dashboard config |
| A10 | Auth | Cannot verify | Signup/reset enumeration resistance is a Supabase Auth dashboard setting |
| A11 | Auth | Cannot verify | Google OAuth redirect allowlist is Supabase/Google dashboard config |
| A23 | File uploads | Cannot verify | Storage path store-id prefixing relies on `storage.objects` RLS not present in tracked migrations |
| A24 | File uploads | Cannot verify | `storefront-photos` signed-URL scope depends on live RLS SELECT policy, not tracked |
| A2 | Public tokens | None — verified OK | No endpoint lists/searches tokens; all lookups require the exact token |
| A5 | Public tokens | None — verified OK | `stores_public`/anon column grant is properly scoped and `security_invoker`-backed |
| A12 | Auth | None — verified OK | No open-redirect via `redirect`/`next`/`returnTo` found anywhere |
| A13 | Payments | None — verified OK | Webhook signature verification (HMAC-SHA512) correctly implemented and enforced |
| A15 | Payments | None — verified OK | Webhook/verify flows credit DB-stored amounts, idempotent via `status='pending'` guard |
| A16 | Payments | None — verified OK | No path lets a client set paid/status directly without a verified payment |
| A19 | File uploads | None — verified OK | `ai-design-photos` bucket confirmed locked to member-only reads via migration |
| A20 | File uploads | None — verified OK | Selfie upload path-prefix and format validated server-side |
| A25 | Web security | None — verified OK | Both `dangerouslySetInnerHTML` uses are static/trusted content only |
| A30 | Messaging | None — verified OK | All WhatsApp sends are client-side `wa.me` links from fixed templates, human-click-gated |
| A33 | Secrets | None — verified OK | No hardcoded secrets on HEAD or in full git history |
| A34 | Secrets | None — verified OK | Client bundle uses anon key only; service-role key is server-env-only everywhere |
| A35 | Dependencies | None — verified OK | `npm audit` reports 0 vulnerabilities |
| S6-1 | AI gateway | None — verified OK | Every text/audio AI call goes through the single gateway; no client-side provider key |
| S6-6 | AI gateway | None — verified OK | No AI call can read another store's data |
| S6-5 | AI gateway | Informational | Prompt-injection risk class from the original spec (notebook photo/WhatsApp chat import) has no matching AI feature built yet |
| S6-7 | AI gateway | Informational | Budget/rate-limit gateway logic verified by code review only, not yet observed live under real traffic |
---

# Track B — Live database findings (Lovable)

**Date:** 21 September 2026
**Scope:** live Lovable Cloud Postgres (`public` and `storage` schemas), storage buckets, and the
application code paths that call them. Read-only pass — no code, policy, setting, grant, bucket or
row was changed. All verification was done with `SELECT`-only queries against `pg_catalog`,
`pg_policies`, `storage.buckets`, `storage.objects` policies, and by reading function bodies with
`pg_get_functiondef`, plus source reading of the app and edge functions.

**Method / limits.** Findings were verified by inspecting definitions, grants and policy
expressions, and by reading the calling code. Because the instruction was to change nothing, no
exploit was actually executed against live data (no test rows written, no privilege actually
escalated). Where a finding therefore rests on definition-reading rather than an executed attack,
this is stated explicitly in "How verified".

---

### L1 — A store owner can grant themselves any paid plan and unlimited trial

> **Status: fixed and confirmed closed** (migration
> `20260921125959_...sql`). A `BEFORE UPDATE` trigger on `stores` blocks
> changes to `plan_code`, `trial_ends_at`, `is_active`, `owner_id`,
> `referral_code`, `referred_by_store_id`, `country_code`, and `currency`
> unless the request runs as `service_role` or a platform admin. A
> three-valued-logic bug in the first version (`auth.role() = 'service_role'`
> is `NULL`, not `false`, with no JWT context, and that `NULL` silently
> defeated the `IF` check) was caught by the operator's own live test and
> patched with `COALESCE(..., false)` around both guard checks. Verified
> live: the sensitive-column update now raises `42501`, an ordinary column
> update still succeeds.

- **Area:** Database access / entitlements
- **Severity:** Critical
- **Location:** table `public.stores`; policy `stores_update_owner`
  (`UPDATE ... USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())`);
  table grant `authenticated=arwdDxtm` on `public.stores` (full column-level UPDATE).
- **What an attacker could do:** any signed-in store owner — no special tooling beyond the public
  API key already shipped in the browser — can issue
  `update stores set plan_code='business', trial_ends_at='2030-01-01' where id=<their own store>`
  and the policy accepts it, because it only checks row ownership, not which columns changed. The
  same path allows setting `is_active`, rewriting `referral_code`, setting `referred_by_store_id`
  (referral-reward abuse), and changing `owner_id` to hand the store to another account. All plan
  gating in the product (`effective_plan_code`, `check_feature_limit`, `can_use_feature`, WhatsApp
  allowances, AI quotas, platform fee tier via `planFeePercent`) reads `stores.plan_code` /
  `stores.trial_ends_at`, so this is a complete, silent bypass of every paid entitlement and of the
  Paystack subaccount fee percentage set at connect time.
- **How verified:** read the policy from `pg_policies` (no column predicate, no `OLD`/`NEW`
  comparison possible in RLS), read the ACL from `pg_class.relacl` confirming `authenticated` holds
  unqualified `UPDATE` on the whole table, and confirmed via `pg_trigger` that the only `UPDATE`
  triggers on `stores` are `stores_updated_at`, `on_store_plan_history`, `on_store_referral_code`,
  `on_store_referral_reward` — all of which record or derive values, none of which reject a
  self-serve plan change. `track_store_plan_change` writes a `subscription_history` row, i.e. it
  logs the escalation but does not prevent it. Not executed against live data.
- **Recommended fix:** revoke column-level UPDATE from `authenticated` on the billing/identity
  columns (`plan_code`, `trial_ends_at`, `is_active`, `owner_id`, `referral_code`,
  `referred_by_store_id`, `country_code`, `currency`) and re-grant UPDATE only on the
  profile columns the settings screens actually write; or add a `BEFORE UPDATE` trigger that raises
  unless those columns are unchanged or the session is `service_role`. Plan changes should only be
  writable by the billing/webhook path running with the service role.

---

### L2 — `anon` and `authenticated` hold blanket INSERT/UPDATE/DELETE on almost every table

> **Status: fix delivered, not yet applied** (migration `20260921140000_...sql`,
> tracked in the repo — no live DB execution access from this session). Verified
> directly against client code rather than the original guess below: `anon` is
> revoked entirely then re-granted only `INSERT` on `leads`/`sew_requests`/
> `consultation_requests`/`analytics_events`, `SELECT` on `storefront_items`/
> `stores_public`, and the existing narrow column-level `SELECT` on `stores`.
> `authenticated` keeps its existing grants on normal app tables (already
> scoped per-row by RLS) and loses access only to the admin/internal/RPC-only
> tables (`platform_admins`, `subscription_history`, `usage_log`,
> `usage_counters`, `feature_usage_counters`, `ai_response_cache`,
> `ai_design_payments`, `order_payment_links`, `audit_logs`, `app_settings`,
> `country_configs`, `garment_type_aliases`, `calendar_event_overrides`), plus
> a downgrade to `SELECT`-only on `plans` and `payment_accounts` (writes to
> both go through RPCs, not direct table access — contrary to the original
> "authenticated needs no privileges at all on plans" guess below, which was
> wrong: `billing.tsx` reads `plans` directly). Update this line once the
> store operator confirms the app still works end-to-end after running it.

- **Area:** Database access / grants
- **Severity:** High
- **Location:** `pg_class.relacl` for 45 of 47 public tables, e.g. `clients`, `orders`, `payments`,
  `measurement_sets`, `payment_accounts`, `plans`, `platform_admins`, `subscription_history`,
  `audit_logs`, `usage_log`, `usage_counters`, `store_members`, `support_grants` — each shows
  `anon=arwdDxtm/postgres authenticated=arwdDxtm/postgres`. Only `rate_limit_hits` is correctly
  restricted to `service_role`.
- **What an attacker could do:** nothing today on its own — RLS is enabled on all 47 tables, so
  these grants are currently masked. The risk is structural: the entire tenant boundary rests on a
  single layer. Any future policy that is added permissively, any table created with RLS forgotten,
  or any `USING (true)` introduced during a refactor immediately becomes unauthenticated
  read/write, including to `plans`, `platform_admins` and `audit_logs`. Grants such as
  `anon DELETE` on `clients`/`payments` are not needed by any code path in the app.
- **How verified:** enumerated `relacl` for every relation in `public`; cross-checked RLS state
  (`pg_class.relrowsecurity = true` for all 47 tables) and the 110 policies in `pg_policies`.
- **Recommended fix:** narrow grants to what each table's policies actually permit — e.g. `anon`
  needs `INSERT` only on `leads`, `sew_requests`, `consultation_requests`, `analytics_events` and
  `SELECT` on `plans`, `garment_types`, `country_configs`, `storefront_items` and the ten public
  columns of `stores`; `authenticated` needs no privileges at all on `plans`, `platform_admins`,
  `subscription_history`, `usage_log`, `ai_response_cache`, `ai_design_payments`.

---

### L3 — Audit logging exists but captures nothing

> **Status: fix delivered, not yet applied** (migration `20260921150000_...sql`).
> `log_audit_event(p_store_id, p_action, p_entity, p_entity_id, p_metadata)`
> already existed and was already called from one place (granting support
> access in `privacy.tsx`) — reused as-is (its body wasn't touched, only its
> public contract), now called from new `AFTER` triggers on `store_members`
> (member added/role changed/removed), `payment_accounts` (payout account
> added/updated/removed), `support_grants` (granted/revoked — the redundant
> manual call in `privacy.tsx` was removed in favour of the trigger), and
> `stores` (plan changed, complementing L1's blocking trigger). Triggers
> guarantee coverage regardless of which code path performs the write,
> rather than depending on every future call site remembering to log; each
> wraps its call in its own exception handler so logging can never block the
> underlying operation. Client/order deletion covered the same way
> (`AFTER DELETE` on `clients`/`orders`). Data export isn't a table write, so
> `privacy.tsx`'s `exportAllData` now calls `log_audit_event` directly with
> a row-count-per-table metadata payload after the export completes.
> Platform-admin RPC calls already have a working read path
> (`admin_list_audit_logs`, `SECURITY DEFINER`, checked live) — logging
> *reads* by `admin_list_stores`/`admin_platform_stats`/etc. is not yet
> done, since it would mean editing those functions' unknown existing
> bodies; flagged as a smaller remaining gap, not attempted here. The
> client-forgeable-actor_id risk this finding also flagged is already closed
> by L2 (`authenticated` now has zero direct grants on `audit_logs`).

- **Area:** Audit logging / NDPA readiness
- **Severity:** High
- **Location:** table `public.audit_logs`; function `log_audit_event(uuid, text, text, uuid, jsonb)`
- **What an attacker could do:** act without a trace. A manager adding or removing staff, an owner
  changing the payout account, a platform admin using `admin_list_stores` /
  `admin_store_ai_usage`, a support grant being issued, a client record being deleted, or a full
  CSV export of every client and payment leaves no record. After an incident there is no way to
  establish who did what or when.
- **How verified:** `select count(*) from public.audit_logs` returns **0** — the table has never
  received a row. `log_audit_event` exists and is executable by `authenticated`, but a source search
  shows no call site in the app, no trigger invoking it, and no edge function writing to
  `audit_logs`. Authentication events (successful and failed logins) live only in the managed auth
  logs, which are retained by the platform, not in this table.
- **Recommended fix:** write audit rows from the server side (triggers or the privileged server
  functions, not the client, since the insert policy currently trusts a client-supplied
  `actor_id`) for at minimum: role and membership changes, payout-account changes, support-grant
  issue/revoke, client and order deletion, data export, plan changes, and platform-admin RPC calls.
  Keep the read policy owner/manager-scoped as it is and add a platform-admin read path.
- **Related:** the insert policy `audit_logs_insert_members`
  (`WITH CHECK (is_store_member(store_id) AND actor_id = auth.uid())`) lets any member write
  arbitrary `action`/`metadata` values, so once logging starts the table is forgeable by members
  unless writes move server-side.

---

### L4 — Payout account changes need only a normal session and are invisible afterwards

- **Area:** Payout accounts
- **Severity:** High
- **Location:** table `public.payment_accounts` (single policy `payment_accounts_member_select`,
  SELECT only); edge function `supabase/functions/connect-payment-account/index.ts`
- **What an attacker could do:** whoever holds a live owner or manager session (stolen laptop,
  session token, phished password, or a manager acting maliciously) can repoint the shop's Paystack
  subaccount to their own bank account in a single request. All subsequent customer payments settle
  to the attacker. There is no re-authentication, no OTP, no cooldown, no email/WhatsApp
  notification, and no audit row — the previous account number is overwritten in place by the
  `upsert` (`onConflict: store_id`), so even the old value is lost.
- **How verified:** `pg_policies` shows exactly one policy on `payment_accounts` and it is
  `SELECT`-only, so direct client writes are refused; `pg_trigger` shows **no triggers at all** on
  the table, therefore no logging, no cooldown and no history at the database layer. The only write
  path is the edge function, whose code performs a single check — active `store_members` row with
  role `owner` or `manager` — before `resolveAccountNumber`, `createSubaccount` and the upsert.
  Confirmed no `audit_logs` row is produced (table is empty, see L3).
- **Recommended fix:** at the database layer, add an append-only `payment_account_changes` history
  table written by an `AFTER INSERT OR UPDATE` trigger, plus a trigger that rejects a change within
  N hours of the previous one; in the application, require re-entry of the password (or an OTP to
  the registered WhatsApp number) before calling the edge function, and notify the owner on both
  the old and new contact details whenever the payout account changes.

---

### L5 — `check_feature_limit`, `effective_plan_code` and `can_use_feature` do not check the caller

- **Area:** Plan limits and entitlements
- **Severity:** Medium
- **Location:** functions `public.check_feature_limit(uuid, text, integer)` (EXECUTE granted to
  `authenticated`), `public.effective_plan_code(uuid)` and `public.can_use_feature(uuid, text)`
  (EXECUTE `service_role` only)
- **What an attacker could do:** any signed-in user can call
  `check_feature_limit('<any other store id>', 'orders')` and receive that store's plan code, its
  numeric allowance, its current usage for the month, and the plan it would need to upgrade to.
  This is competitor-visible business intelligence (which shops are on free, how busy they are),
  not customer data, and it is read-only — but it crosses the tenant boundary. `effective_plan_code`
  and `can_use_feature` share the same absence of a membership check; they are currently reachable
  only by `service_role`, so they are not exposed directly today, and `check_feature_limit` calls
  `effective_plan_code` internally as definer.
- **How verified:** read all three bodies with `pg_get_functiondef` — none contains an `auth.uid()`
  or `is_store_member` test — and read `proacl`, which shows `check_feature_limit` executable by
  `authenticated`. By contrast `feature_usage(uuid, text)` **does** open with
  `IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN RAISE ... 42501`, which is
  the correct pattern. Not executed cross-tenant against live data.
- **Recommended fix:** add the same membership guard to `check_feature_limit` that `feature_usage`
  already has. Note the limits themselves are read server-side from `public.plans` — no
  client-supplied limit is trusted anywhere in these functions — and `increment_usage_counter` /
  `increment_feature_usage` are correctly restricted to `service_role`, so usage counters cannot be
  written from the browser.

**Actual body of `check_feature_limit`, for version control** (as live on 21 Sep 2026):

```sql
CREATE OR REPLACE FUNCTION public.check_feature_limit(p_store_id uuid, p_feature text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_code text;
  v_limit jsonb;
  v_limit_num numeric;
  v_used numeric;
  v_allowed boolean;
  v_required_plan text;
BEGIN
  BEGIN
    SELECT public.effective_plan_code(p_store_id) INTO v_plan_code;
  EXCEPTION WHEN OTHERS THEN
    SELECT CASE WHEN trial_ends_at IS NOT NULL AND trial_ends_at > now() THEN 'growth' ELSE plan_code END
      INTO v_plan_code
      FROM public.stores WHERE id = p_store_id;
  END;

  IF v_plan_code IS NULL THEN
    RAISE EXCEPTION 'Store not found';
  END IF;

  SELECT limits -> p_feature INTO v_limit FROM public.plans WHERE code = v_plan_code;

  IF p_feature = 'storefront_items' THEN
    SELECT count(*) INTO v_used FROM public.storefront_items WHERE store_id = p_store_id;
  ELSIF p_feature = 'users' THEN
    SELECT count(*) INTO v_used FROM public.store_members WHERE store_id = p_store_id AND status = 'active';
  ELSE
    SELECT COALESCE(used, 0) INTO v_used
      FROM public.feature_usage_counters
      WHERE store_id = p_store_id AND feature_key = p_feature AND period_month = date_trunc('month', now())::date;
    v_used := COALESCE(v_used, 0);
  END IF;

  IF v_limit IS NULL OR v_limit = 'null'::jsonb THEN
    v_allowed := true;
    v_limit_num := NULL;
  ELSE
    v_limit_num := (v_limit)::text::numeric;
    v_allowed := (v_used + p_quantity) <= v_limit_num;
  END IF;

  IF NOT v_allowed THEN
    SELECT code INTO v_required_plan
    FROM public.plans
    WHERE code != v_plan_code
      AND (limits -> p_feature IS NULL OR limits -> p_feature = 'null'::jsonb
           OR (limits -> p_feature)::text::numeric >= (v_used + p_quantity))
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', CASE WHEN v_limit IS NULL OR v_limit = 'null'::jsonb THEN NULL
                  WHEN v_limit_num = 0 THEN to_jsonb(false)
                  ELSE to_jsonb(v_limit_num) END,
    'used', v_used,
    'plan', v_plan_code,
    'required_plan', v_required_plan
  );
END;
$function$
```

Two secondary observations on this body: an unknown `p_feature` (typo or invented key) returns
`allowed = true` rather than failing closed, and the `EXCEPTION WHEN OTHERS` fallback would mask a
genuine error inside `effective_plan_code` by silently recomputing the plan.

---

### L6 — Legacy `sew_requests` policies cancel out the validated ones

- **Area:** Database access / policies
- **Severity:** Medium
- **Location:** table `public.sew_requests`, policies `Anyone can submit a sew request`
  (`INSERT TO anon WITH CHECK (true)`) alongside `sew_requests_public_insert` (which validates the
  store exists and the item is published), and `Store members update sew requests`
  (`UPDATE USING is_store_member(store_id)`) alongside `sew_requests_member_update`
  (owner/manager only)
- **What an attacker could do:** permissive policies are OR-ed, so the blanket `WITH CHECK (true)`
  policy makes the validation in `sew_requests_public_insert` unreachable — an anonymous caller can
  insert a sew request pointing at any `store_id`, including a non-existent or inactive one, or
  referencing an unpublished item, and can fill `order_id`/`status` freely. The overlapping UPDATE
  pair similarly downgrades the intended owner/manager restriction to any store member, so a
  tailor-level account can alter request status and linkage. The rate-limit trigger
  `enforce_sew_request_rate_limit` still applies, so this is spam-bounded, not unbounded.
- **How verified:** listed all six `sew_requests` policies from `pg_policies` and compared their
  `qual`/`with_check` expressions; confirmed both duplicate pairs are `PERMISSIVE`.
- **Recommended fix:** drop the two legacy policies (`Anyone can submit a sew request`,
  `Store members update sew requests`) so only the validated pair remains. The equivalent cleanup
  was already applied to `consultation_requests`, which now has a single validated insert policy.

---

### L7 — Client deletion leaves photographs in storage and severs history silently

- **Area:** Data export and deletion / NDPA erasure
- **Severity:** Medium
- **Location:** `src/routes/_authenticated/clients/$clientId.tsx` (`handleDelete` →
  `supabase.from("clients").delete().eq("id", client.id)`); foreign keys on `public.clients`
- **What an attacker could do:** not an attack — a compliance gap. Deleting a client removes the
  database row and cascades to `measurement_sets` and `measurement_passports`
  (`confdeltype = 'c'`), nulls the link on `messages`, `consultations`, `event_participants` and
  `measurement_passport_shares` (`'n'`), and is blocked outright when the client has orders
  (`orders_client_id_fkey` is `RESTRICT`). But `clients.photo_url`, any AI-design selfie under
  `ai-design-photos/<store_id>/selfies/…`, and the generated design images are **not** removed:
  no server function, RPC or storage call is made. There is no `delete_client`-style RPC anywhere
  in the database (`pg_proc` search for `delete|export|purge|erase` returned nothing), so erasure is
  a raw client-side row delete. A data-subject erasure request therefore cannot be honoured fully,
  and the "delete" leaves the person's photograph retrievable by any store member via a signed URL.
- **How verified:** traced the delete path in source; enumerated `pg_constraint` entries referencing
  `public.clients` for delete actions; searched `pg_proc` for any deletion routine; confirmed no
  storage `remove()` call exists in the app outside the storefront item flow.
- **Recommended fix:** implement a privileged `deleteClient` server function that deletes the
  client's storage objects (profile photo, AI-design selfies and generated images tied to that
  client), anonymises rather than orphans the historical rows, writes an audit entry, and returns a
  clear message when orders block hard deletion.

---

### L8 — `anon` can insert unlimited leads and forge analytics events

- **Area:** Database access / public write surface
- **Severity:** Low
- **Location:** policy `Anyone can submit a lead` on `public.leads`
  (`INSERT TO anon WITH CHECK (true)`); policy `analytics_events_public_insert` on
  `public.analytics_events`
- **What an attacker could do:** flood `leads` with junk rows (no rate-limit trigger exists on this
  table, unlike `sew_requests` and `consultation_requests`, which both have one), costing storage
  and burying real enquiries. On `analytics_events`, `visitor_id` is client-supplied and only the
  event name and a ±5 minute timestamp window are validated, so the six launch metrics on the admin
  Analytics tab (visitor→signup rate in particular) can be inflated or deflated by anyone.
- **How verified:** read both policies; confirmed via `pg_trigger` that `leads` has no rate-limit
  trigger while `sew_requests` and `consultation_requests` do.
- **Recommended fix:** attach the existing `check_rate_limit` pattern to `leads` inserts, and treat
  analytics figures as indicative rather than authoritative (or move `signup_completed` to a
  server-side write keyed on the real user).

---

### L9 — Several policies are written for the `public` role rather than `authenticated`

- **Area:** Database access / defence in depth
- **Severity:** Low
- **Location:** `expenses` (`Owners and managers manage expenses`), `measurement_passports` (all
  three), `measurement_passport_shares`, `message_topups`, `order_payment_links`,
  `payment_accounts`, `platform_admins`, `referral_rewards`, `store_invites`,
  `store_monthly_snapshots`, `support_grants`
- **What an attacker could do:** nothing directly — each of these policies calls
  `has_store_role` / `is_store_member` / `is_platform_admin`, which return false when
  `auth.uid()` is null, so anonymous callers are still refused. The exposure is that the policies
  are evaluated for anonymous requests at all, so a future change to any of those helper functions
  (or a helper returning true for a null uid) would expose the table to the public internet rather
  than only to signed-in users.
- **How verified:** read the `roles` column of each policy in `pg_policies`; read the bodies of the
  three helper functions and confirmed each is `SECURITY DEFINER` with `SET search_path = public`
  and filters on `auth.uid()`.
- **Recommended fix:** re-declare these policies `TO authenticated`.

---

### Areas checked and found sound

These were audited and no finding is raised; recorded so the coverage is explicit.

- **RLS coverage.** All 47 public tables have `relrowsecurity = true`. Four have RLS on with no
  policies at all — `ai_design_payments`, `ai_response_cache`, `rate_limit_hits`,
  `feature_usage_counters` (read-only policy) — which means deny-all for `anon`/`authenticated`
  despite the grants in L2; they are reached only by the service role. Intentional.
- **SECURITY DEFINER inventory.** 49 definer functions exist in `public`; **every one** has
  `SET search_path TO 'public'` pinned (verified from `pg_proc.proconfig`). EXECUTE is granted to
  `anon` on only four, all of them deliberate unguessable-token public flows:
  `get_invite_by_token`, `get_participant_by_token`, `set_participant_style`,
  `set_participant_measurement_choice`. Sensitive helpers (`resolve_login_email`,
  `get_design_by_token`, `check_rate_limit`, `increment_usage_counter`,
  `increment_feature_usage`, `has_active_support_grant`, `effective_plan_code`,
  `can_use_feature`, and all trigger functions) are `service_role`-only. The `admin_*` family is
  executable by `authenticated` but each verifies `is_platform_admin()` internally.
  Exception: `check_feature_limit` — see L5.
- **Service role key.** No occurrence of a service-role key, `sb_secret_`, or a JWT-shaped literal
  in any function body (`pg_proc.prosrc` scan) or in any policy expression (`pg_policies` scan).
  The key is read from the environment inside `client.server.ts` and the edge functions only.
- **Storage buckets.** Exactly two buckets exist: `ai-design-photos` and `storefront-photos`.
  Both are **private** (`public = false`) with a 5 MB size limit — re-confirmed live. There is no
  public-read policy on either. `ai-design-photos` has a single policy,
  `ai_design_photos_member_read`, scoped to `is_store_member(split_part(name,'/',1)::uuid)` — the
  store-id folder prefix — and no INSERT/UPDATE/DELETE policy at all, so uploads happen only
  through the server function using the admin client. `storefront-photos` restricts write to
  owner/manager on the store's own folder prefix, member read by prefix, and anonymous read only
  where the object is referenced by a `published = true` storefront item. Objects are served
  exclusively via signed URLs.
- **Views.** All three views (`stores_public`, `order_balances`, `orders_for_tailor`) have
  `security_invoker = true`, so the caller's RLS applies and they cannot be used to read around a
  policy. `order_balances` additionally filters on `has_store_role(...)` in its own definition.
- **Anonymous access to `stores`.** Column-scoped correctly: `anon` holds SELECT only on `id`,
  `name`, `slug`, `city`, `logo_url`, `is_active`, `cover_url`, `accent_color`, `bio`,
  `whatsapp_phone`, `opening_hours` — `owner_id`, `plan_code`, `trial_ends_at`, `referral_code`,
  `referred_by_store_id` are not readable.
- **Column-level write risk on other tables.** `store_members` UPDATE/INSERT policies block a
  manager from assigning or editing the `owner` role; the `restrict_tailor_order_update` trigger
  blocks a tailor from changing `price`, `client_id`, `garment_type`, `quantity`,
  `delivery_date`, `assigned_to`, `priority` or `number` on orders they are assigned; no policy
  allows writing `plans`, `platform_admins`, `subscription_history`, `usage_counters`,
  `feature_usage_counters`, `usage_log`, `payment_accounts` or `order_payment_links` from a
  browser session. Apart from L1, no path was found to change one's own plan, role, store_id, fee
  percentage, payout details, usage counters or verification flags.
- **Data export.** A store owner can export their own data: `exportAllData` in
  `src/routes/_authenticated/privacy.tsx` downloads CSVs of `clients`, `measurement_sets`,
  `orders`, `payments`, `consultations`, `events`, `expenses`, each filtered by `store_id` and
  further constrained by RLS. Export is not itself audited (see L3).

---

### NDPA 72-hour breach-notification readiness

**Not adequate today.** Every table carries a `created_at`, and `orders`, `clients`, `stores` and
`store_settings` also carry `updated_at`, so the *scope* of a data change can be approximated after
the fact. But there is no record of *access*: `audit_logs` is empty (L3), nothing logs reads,
exports, admin RPC use, support-grant activity or payout changes, and successful/failed logins are
visible only in the platform's managed auth logs, which are not joined to store data. Given a
credential compromise, it would not be possible to state within 72 hours which stores' or clients'
records an attacker actually viewed or exported — only which rows they modified. Closing L3, with
server-side audit writes covering read-heavy actions (export, admin RPCs, support access), is the
prerequisite for meeting the NDPA notification duty.

---

### Summary table

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| L1 | Critical | Entitlements | ✅ Fixed — `stores_update_owner` + full-column UPDATE grant let an owner set their own `plan_code`, `trial_ends_at`, `is_active`, `owner_id` |
| L2 | High | Grants | `anon`/`authenticated` hold blanket INSERT/UPDATE/DELETE on 45 of 47 tables; RLS is the only layer |
| L3 | High | Audit logging | `audit_logs` has zero rows; no role, payout, support, deletion, export or admin action is recorded |
| L4 | High | Payout accounts | Payout account can be repointed with a normal owner/manager session — no re-auth, cooldown, history or notification |
| L5 | Medium | Entitlements | `check_feature_limit` (and `effective_plan_code`, `can_use_feature`) never verify the caller belongs to `p_store_id` |
| L6 | Medium | Policies | Legacy `sew_requests` policies (`WITH CHECK (true)`, member-wide UPDATE) override the validated ones |
| L7 | Medium | Deletion | Client deletion removes the row but leaves photographs and AI selfies in storage; no erasure RPC exists |
| L8 | Low | Public writes | `leads` insert is unrate-limited; `analytics_events` visitor IDs are client-supplied and forgeable |
| L9 | Low | Policies | Eleven policies target the `public` role instead of `authenticated` (defence in depth only) |

No changes were made to code, policies, settings, grants, buckets or data during this pass.

---

# Combined severity summary (both tracks)

| ID | Severity | Track | One-line summary |
|----|----------|-------|-------------------|
| L1 | **Critical** | B | ✅ Fixed — any store owner could self-escalate plan/trial/active status/ownership via `stores` UPDATE — no column-level check |
| L2 | High | B | `anon`/`authenticated` hold blanket INSERT/UPDATE/DELETE on 45 of 47 tables; RLS is the only real layer |
| L3 | High | B | `audit_logs` has zero rows — no role/payout/support/deletion/export/admin action is recorded anywhere |
| L4 | High | B | Payout account can be repointed with a normal owner/manager session — no re-auth, cooldown, history, or notification |
| A7 | Medium | A | `resolveLoginEmail` is an unrate-limited phone-number user-enumeration oracle |
| A18 | Medium | A | `notify-admin-budget` has no auth/rate-limit — anyone can trigger admin email spam |
| A21 / S6-3 | Medium | A | `generate-design` never validates `storeId` exists — quota/dashboard-pollution vector against another store |
| A22 | Medium | A | `resizeImageFile`'s decode-failure fallback can upload non-image bytes mislabeled `image/jpeg` |
| A29 | Medium | A | Raw `PostgrestError.message` (schema-revealing DB error text) returned to clients in many edge functions |
| A3 | Medium | A | Three guest RPCs bypass the app's usual rate-limiting layer |
| L5 | Medium | B | `check_feature_limit`/`effective_plan_code`/`can_use_feature` never verify the caller belongs to the store they're asking about |
| L6 | Medium | B | Legacy `sew_requests` policies (`WITH CHECK (true)`, member-wide UPDATE) override the validated replacement policies |
| L7 | Medium | B | Client deletion leaves photos/AI selfies in storage; no erasure RPC exists (NDPA gap) |
| A14 | Low/Info | A | Webhook signature compared with `===`, not constant-time |
| A26 | Low/Info | A | Edge-function input validation present but inconsistent; `callbackUrl` not verified same-origin |
| A27 | Low/Info | A | `Access-Control-Allow-Origin: *` on all functions (bearer-token check is the real gate) |
| A28 | Low | A | CSP intentionally not yet configured (five other security headers already set correctly) |
| A31 | Low/Info | A | Attacker-supplied booking phone could get a fixed WhatsApp template sent to a third party — template-only, human-click-gated |
| S6-2 | Low | A | `generate-design` bypasses the main gateway's plan-quota/rate-limit checks (has its own compensating controls) |
| S6-4 | Low-Medium | A | AI JSON output not schema-validated server-side (human review before save is the compensating control) |
| L8 | Low | B | `leads` insert is unrate-limited; `analytics_events` visitor IDs are client-supplied and forgeable |
| L9 | Low | B | Eleven policies target `public` role instead of `authenticated` (defence in depth only, helper functions already null-safe) |

**NDPA 72-hour breach notification: not ready today** — see Track B's dedicated section above. This is a direct consequence of L3 (empty audit log): scope of a *data change* is roughly reconstructable from `created_at`/`updated_at`, but scope of *access* (what an attacker viewed or exported) is not, and closing that gap requires L3 fixed first.

**What's solid:** Paystack webhook signature verification (HMAC-SHA512) and payment idempotency; no hardcoded secrets anywhere in code or full git history; service-role key never reaches client code; all 47 tables have RLS enabled; both storage buckets are private with correct signed-URL-only serving; all 49 SECURITY DEFINER functions have `search_path` pinned; `npm audit` is clean; most security response headers are already configured correctly; the AI gateway has no cross-store data leakage and every text/audio call goes through one governed path.

Next step: **Phase 2** — pick findings to fix (L1 first), in batches, Critical/High before Medium/Low, each with a rollback-capable migration and a test proving the vulnerability is closed, per the original audit prompt's Phase 2 process.
