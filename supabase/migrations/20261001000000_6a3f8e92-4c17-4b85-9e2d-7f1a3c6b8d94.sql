-- URGENT: close the anon-grant drift the platform admin security panel's
-- weekly re-check flagged (run 01/10/2026 12:11:37): `anon` held full CRUD
-- (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE) on 32
-- tables that should never be anon-readable or anon-writable at all --
-- every one of them is internal business/financial/admin data (AI billing,
-- payroll, inventory, passport internals, festive campaigns, dedicated
-- accounts, quotes, staff pay, etc.), not anything a signed-out visitor is
-- meant to touch.
--
-- Root cause: every one of these 32 tables was created by a migration
-- *after* the original security-hardening pass (the one the admin panel's
-- check description calls its "L2 and L9 findings"), and none of those
-- later migrations' CREATE TABLE statements paired an explicit REVOKE for
-- anon with their GRANT ... TO authenticated line. PostgreSQL grants PUBLIC
-- (which anon inherits from, same as every role) a blanket set of table
-- privileges by default unless something explicitly revokes them, so each
-- of these tables quietly inherited the hole the moment it was created --
-- this was never one bad migration, it was a missing safety net for every
-- future one.
--
-- This migration does two things: closes the hole that exists right now,
-- and (via ALTER DEFAULT PRIVILEGES) makes sure a table created by a future
-- migration can't silently reopen it -- any new table will default to no
-- anon/authenticated access at all until a migration explicitly grants it,
-- which is already how every tracked migration in this repo writes its
-- GRANT lines anyway.
--
-- Safe to re-run: every REVOKE is a no-op if the privilege is already gone,
-- and ALTER DEFAULT PRIVILEGES simply replaces the prior default each time.

BEGIN;

REVOKE ALL ON TABLE public.ai_config FROM anon;
REVOKE ALL ON TABLE public.ai_credit_packs FROM anon;
REVOKE ALL ON TABLE public.ai_feature_costs FROM anon;
REVOKE ALL ON TABLE public.ai_ledger FROM anon;
REVOKE ALL ON TABLE public.ai_plan_allowances FROM anon;
REVOKE ALL ON TABLE public.ai_style_previews FROM anon;
REVOKE ALL ON TABLE public.ai_topup_purchases FROM anon;
REVOKE ALL ON TABLE public.ai_wallets FROM anon;
REVOKE ALL ON TABLE public.dedicated_accounts FROM anon;
REVOKE ALL ON TABLE public.directory_reports FROM anon;
REVOKE ALL ON TABLE public.festive_campaigns FROM anon;
REVOKE ALL ON TABLE public.fitting_links FROM anon;
REVOKE ALL ON TABLE public.incoming_transfers FROM anon;
REVOKE ALL ON TABLE public.inventory_items FROM anon;
REVOKE ALL ON TABLE public.inventory_items_for_tailor FROM anon;
REVOKE ALL ON TABLE public.inventory_movements FROM anon;
REVOKE ALL ON TABLE public.order_approvals FROM anon;
REVOKE ALL ON TABLE public.order_attachments FROM anon;
REVOKE ALL ON TABLE public.order_materials_for_tailor FROM anon;
REVOKE ALL ON TABLE public.passport_access_log FROM anon;
REVOKE ALL ON TABLE public.passport_holders FROM anon;
REVOKE ALL ON TABLE public.passport_sessions FROM anon;
REVOKE ALL ON TABLE public.passport_shares FROM anon;
REVOKE ALL ON TABLE public.pay_rates FROM anon;
REVOKE ALL ON TABLE public.payroll_lines FROM anon;
REVOKE ALL ON TABLE public.payroll_runs FROM anon;
REVOKE ALL ON TABLE public.quotes FROM anon;
REVOKE ALL ON TABLE public.staff_advances FROM anon;
REVOKE ALL ON TABLE public.staff_earnings FROM anon;
REVOKE ALL ON TABLE public.store_closed_dates FROM anon;
REVOKE ALL ON TABLE public.store_occasions FROM anon;
REVOKE ALL ON TABLE public.voice_transcription_log FROM anon;

-- Permanent guard: any table created from here on by whichever role runs
-- migrations (the role executing this statement right now, in Lovable's SQL
-- editor, is the same one that applies every migration) starts with NO
-- default privileges for anon or authenticated. A migration that wants a
-- new table usable still has to say so explicitly with its own GRANT line
-- -- exactly the pattern every tracked migration in this repo already
-- follows -- so a forgotten grant now fails closed instead of open.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;

-- Verification: run this after the block above. Expect zero rows -- any row
-- returned here is a privilege that survived the REVOKEs and needs a look.
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'ai_config', 'ai_credit_packs', 'ai_feature_costs', 'ai_ledger',
    'ai_plan_allowances', 'ai_style_previews', 'ai_topup_purchases',
    'ai_wallets', 'dedicated_accounts', 'directory_reports',
    'festive_campaigns', 'fitting_links', 'incoming_transfers',
    'inventory_items', 'inventory_items_for_tailor', 'inventory_movements',
    'order_approvals', 'order_attachments', 'order_materials_for_tailor',
    'passport_access_log', 'passport_holders', 'passport_sessions',
    'passport_shares', 'pay_rates', 'payroll_lines', 'payroll_runs',
    'quotes', 'staff_advances', 'staff_earnings', 'store_closed_dates',
    'store_occasions', 'voice_transcription_log'
  );
