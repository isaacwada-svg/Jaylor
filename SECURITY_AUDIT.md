# Jaylor — Security Audit

> Note: no `SECURITY_AUDIT.md` existed in the repository root at the time of this pass
> (verified: `ls SECURITY_AUDIT.md` → no such file). This file was therefore created and
> contains only the Track B section below. No existing content was overwritten, and no
> A-prefixed findings were present to preserve.

## Track B — Live database findings (Lovable)

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
| L1 | Critical | Entitlements | `stores_update_owner` + full-column UPDATE grant lets an owner set their own `plan_code`, `trial_ends_at`, `is_active`, `owner_id` |
| L2 | High | Grants | `anon`/`authenticated` hold blanket INSERT/UPDATE/DELETE on 45 of 47 tables; RLS is the only layer |
| L3 | High | Audit logging | `audit_logs` has zero rows; no role, payout, support, deletion, export or admin action is recorded |
| L4 | High | Payout accounts | Payout account can be repointed with a normal owner/manager session — no re-auth, cooldown, history or notification |
| L5 | Medium | Entitlements | `check_feature_limit` (and `effective_plan_code`, `can_use_feature`) never verify the caller belongs to `p_store_id` |
| L6 | Medium | Policies | Legacy `sew_requests` policies (`WITH CHECK (true)`, member-wide UPDATE) override the validated ones |
| L7 | Medium | Deletion | Client deletion removes the row but leaves photographs and AI selfies in storage; no erasure RPC exists |
| L8 | Low | Public writes | `leads` insert is unrate-limited; `analytics_events` visitor IDs are client-supplied and forgeable |
| L9 | Low | Policies | Eleven policies target the `public` role instead of `authenticated` (defence in depth only) |

No changes were made to code, policies, settings, grants, buckets or data during this pass.
