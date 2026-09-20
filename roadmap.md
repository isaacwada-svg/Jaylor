# Roadmap

## Done
- [x] DB-only change set (no UI) — applied and verified:
  - [x] `stores`: cover_url, legal_line (default Jaylor RC line), timezone (Africa/Lagos), garment_types text[], sews_for (female/male/both), accent_color, onboarding_completed
  - [x] `store_members`: status (active/invited/removed, default active), invited_phone
  - [x] Owner-membership trigger confirmed (on_store_created -> handle_new_store)
  - [x] `measurement_templates` table with RLS (members read; owner/manager write) + seeding trigger on_store_seeded for 8 default templates
  - [x] No existing stores, so no backfill needed; helper function jt_field dropped after use
  - [x] Linter: revoked EXECUTE on trigger + RLS helper functions from anon/public; 4 remaining warnings are the RLS helpers that must stay callable by authenticated users (required by row-security policies)

## Backlog
- [ ] (From earlier discussion, not started) Next-step direction for the app: make data live / order creation / publish / polish empty pages — user pivoted to DB work; revisit later.
