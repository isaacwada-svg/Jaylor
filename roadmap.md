# Roadmap

## Done
- [x] Launch-readiness update: legal copy, verified contact details, truthful proof section, safer WhatsApp allowances, first-party tracking, and private admin analytics.
- [x] DB-only change set (no UI) — applied and verified:
  - [x] `stores`: cover_url, legal_line (default Jaylor RC line), timezone (Africa/Lagos), garment_types text[], sews_for (female/male/both), accent_color, onboarding_completed
  - [x] `store_members`: status (active/invited/removed, default active), invited_phone
  - [x] Owner-membership trigger confirmed (on_store_created -> handle_new_store)
  - [x] `measurement_templates` table with RLS (members read; owner/manager write) + seeding trigger on_store_seeded for 8 default templates
  - [x] No existing stores, so no backfill needed; helper function jt_field dropped after use
  - [x] Linter: revoked EXECUTE on trigger + RLS helper functions from anon/public; 4 remaining warnings are the RLS helpers that must stay callable by authenticated users (required by row-security policies)

## Backlog
- [x] AI design selfies are now private: bucket is private, uploads go through the server, images are shown with short-lived signed links.
- [x] Manual cross-shop access pass (staff-level account, two test shops): no cross-shop reads or writes, no admin data, no tokens beyond the user's own session. Fixed along the way: logged-out visitors can again load public shop pages, seeing only public shop details.
- [ ] Review remaining database security advisories: two intentionally backend-only tables have no user policies; public token functions and signed-in access helpers require callable security functions; one extension remains in the public schema.
- [ ] (From earlier discussion, not started) Next-step direction for the app: make data live / order creation / publish / polish empty pages — user pivoted to DB work; revisit later.
