# Roadmap

## Done
- [x] Premium public redesign: Midnight Atelier palette, editorial homepage, premium imagery, refined calculator, pricing, and shared marketing shell.
- [x] Launch-readiness update: legal copy, verified contact details, truthful proof section, safer WhatsApp allowances, first-party tracking, and private admin analytics.
- [x] DB-only change set (no UI) — applied and verified:
  - [x] `stores`: cover_url, legal_line (default Jaylor RC line), timezone (Africa/Lagos), garment_types text[], sews_for (female/male/both), accent_color, onboarding_completed
  - [x] `store_members`: status (active/invited/removed, default active), invited_phone
  - [x] Owner-membership trigger confirmed (on_store_created -> handle_new_store)
  - [x] `measurement_templates` table with RLS (members read; owner/manager write) + seeding trigger on_store_seeded for 8 default templates
  - [x] No existing stores, so no backfill needed; helper function jt_field dropped after use
  - [x] Linter: revoked EXECUTE on trigger + RLS helper functions from anon/public; 4 remaining warnings are the RLS helpers that must stay callable by authenticated users (required by row-security policies)

## Backlog
- [x] Applied the approved Jaylor brand identity update, reconciled with the uploaded Premium Brand Identity Guidelines.
- [x] Replaced the reconstructed logo artwork with the official uploaded transparent logo and derived app icons.
- [x] AI design selfies are now private: bucket is private, uploads go through the server, images are shown with short-lived signed links.
- [x] Manual cross-shop access pass (staff-level account, two test shops): no cross-shop reads or writes, no admin data, no tokens beyond the user's own session. Fixed along the way: logged-out visitors can again load public shop pages, seeing only public shop details.
- [ ] Review remaining database security advisories: two intentionally backend-only tables have no user policies; public token functions and signed-in access helpers require callable security functions; one extension remains in the public schema.
- [ ] Ad tracking activation: Google Ads connection linked but setup card skipped — reopen google_ads account setup (new account, NGN, Africa/Lagos) when the user is ready; conversion tracking + consent route still to settle before any campaign spends.
- [ ] Microsoft (Bing) Ads: no Lovable connector — needs the user's UET tag ID from a Microsoft Advertising account, then install the tag and map conversions manually.
- [ ] (From earlier discussion, not started) Next-step direction for the app: make data live / order creation / publish / polish empty pages — user pivoted to DB work; revisit later.

## Requested 2026-09-22
- [x] Published live site (jaylor.com.ng + www) with security and button changes.
- [x] Verified manager guardrails at the access-rule level (managers can only add/edit tailors; cannot touch owner or other managers).
- [ ] Customer portal (phone + one-time code; orders, payment status, measurements, shop details) — BLOCKED: no SMS/WhatsApp sending service connected, so codes cannot be delivered.
- [ ] Paystack live webhook — BLOCKED: PAYSTACK_SECRET_KEY not provided.
- [x] Sitemap + robots already submitted to Search Console; no manual action outstanding ("No issues detected").
