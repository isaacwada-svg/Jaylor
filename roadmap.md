# Roadmap

## In progress
- [ ] DB-only change set (no UI):
  - [ ] `stores`: add cover_url, legal_line (default Jaylor RC line), timezone (Africa/Lagos), garment_types text[], sews_for (female/male/both), accent_color, onboarding_completed
  - [ ] `store_members`: add status (active/invited/removed, default active), invited_phone
  - [ ] Confirm owner-membership trigger on stores insert (handle_new_store / on_store_created already exists)
  - [ ] New `measurement_templates` table with RLS (members read; owner/manager write) + seeding trigger for 8 default templates on new stores
  - [ ] Seed default templates for any existing stores

## Backlog
- [ ] (From earlier discussion, not started) Next-step direction for the app: make data live / order creation / publish / polish empty pages — user pivoted to DB work; revisit later.
