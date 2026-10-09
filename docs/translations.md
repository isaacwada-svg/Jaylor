# Translations

Jaylor's client-facing pages support five languages:

| Code  | Language          |
| ----- | ----------------- |
| `en`  | English (source)  |
| `pcm` | Nigerian Pidgin    |
| `ha`  | Hausa              |
| `yo`  | Yoruba             |
| `ig`  | Igbo               |

## File locations

Each `(language, section)` pair is its own flat JSON file:

```
src/lib/i18n/resources/{language}/{section}.json
```

Sections (18 total): `common`, `tracking`, `approval`, `passport`, `directory`,
`storefront`, `quotes`, `events`, `auth`, `app_common`, `app_settings`,
`app_dashboard`, `app_orders`, `app_order_form`, `app_clients`, `app_payments`,
`app_payroll`, `app_inventory`.

So there are 5 languages × 18 sections = **90 files**. Every file has exactly
the same set of keys per section (checked below) — only the English file is
the source of truth for which keys exist; a translated file should never add
or remove a key, only change the value.

## String counts per file (identical across all 5 languages)

| Section        | Keys | Shipped in |
| -------------- | ---- | ---------- |
| common         | 17   | PR L (+8 order-status keys added in PR M) |
| tracking       | 16   | PR L |
| approval       | 23   | PR L |
| passport       | 63   | PR L |
| directory      | 6    | PR L |
| storefront     | 13   | PR L |
| quotes         | 22   | PR L |
| events         | 62   | PR L |
| auth           | 40   | PR M |
| app_common     | 28   | PR M |
| app_settings   | 71   | PR M (2) + PR M2 (69, shop + billing) |
| app_dashboard  | 55   | PR M2 |
| app_orders     | 99   | PR M2 |
| app_order_form | 87   | PR M2 |
| app_clients    | 84   | PR M2 |
| app_payments   | 20   | PR M2 |
| app_payroll    | 68   | PR M2 |
| app_inventory  | 49   | PR M2 |
| **Total**      | **823** | |

## Translation status

The English (`en`) files are the hand-written source. The other four
languages (`pcm`, `ha`, `yo`, `ig`) were **machine-drafted by Claude** —
fluent-adjacent in Pidgin, working (non-native) knowledge of Hausa, Yoruba and
Igbo. Every non-English file carries a marker key:

```json
"_meta_status": "machine-drafted-needs-review"
```

This key is stripped out automatically before the strings reach the app (see
`src/lib/i18n/load-namespaces.ts`) — it exists purely as a flag for whoever
reviews the file, and its leading underscore means it can never collide with
a real translation key (real keys are always lowercase `snake_case` with no
leading underscore).

**Every `pcm`/`ha`/`yo`/`ig` file needs a native-speaker review before this
goes live for real clients.** Treat it the same as a first-pass machine
translation: probably right in substance, may be stiff, inconsistent in
register, or wrong on idiom.

**Deliberate English-in-translation choices (PR M):** in `auth.json` and
`app_common.json`, Pidgin keeps "Email" and "WhatsApp number" as-is (loanwords
in everyday Nigerian Pidgin usage, not business jargon) rather than forcing a
translation. "Balance", "deposit" and similar tailoring/business terms
weren't actually encountered as standalone keys in this PR's scope yet --
when a follow-up PR hits one of them, the same rule applies: if the
English term is genuinely how a Nigerian tailor already says it out loud,
keep it, and leave a one-line note like this one so a reviewer knows it
was a deliberate choice, not a missed translation.

## How to review a file

1. Open `src/lib/i18n/resources/{code}/{section}.json` (e.g.
   `src/lib/i18n/resources/yo/tracking.json`).
2. It's a flat JSON object: `"key": "translated string"`. Edit the **value**
   only — never rename or remove a **key** (the app looks keys up by exact
   name; a renamed key falls back to English silently, which won't be
   obvious without checking this file against the English one).
3. Compare each value to the same key in `src/lib/i18n/resources/en/{section}.json`
   to see what it should mean.
4. Values may contain `{{placeholders}}` like `{{name}}`, `{{date}}`,
   `{{amount}}`, `{{percent}}`, `{{count}}` — keep the placeholder text
   exactly as-is (same spelling, same braces), just move it to wherever it
   naturally falls in the translated sentence.
5. Keep strings short and plain — translations often run longer than English,
   and these render in fixed-width UI (buttons, badges, WhatsApp messages).
6. Once a file is fully reviewed and corrected, delete its `_meta_status` key
   entirely (that's the signal the file is no longer a draft).
7. Do **not** translate anything inside a sentence that's actually a proper
   noun or brand name ("Jaylor", "WhatsApp", "Paystack").

## PR M (part 2): the tailor's own app screens

PR M reuses the exact same framework as PR L (same `loadNamespaces`,
`languages.ts`, fallback rules, fonts, Intl formatting) but adds a
client-side-only delivery mechanism for the authenticated app (`AppI18nProvider`
/ `useAppT` / `useAppLanguage` / `useSetAppLanguage` in
`src/lib/i18n/i18n-context.tsx`), since `/_authenticated` renders with
`ssr: false` -- there's no SSR flash-of-English risk there the way there was
for `/t` or `/a`, so each screen just lazily merges its own namespace into one
shared, long-lived i18next instance on mount.

**What PR M actually ships, fully wired:**

- `profiles.ui_language` (per-user) + `set_my_ui_language()` RPC.
- Sign in / sign up / reset password / email confirmation (`/auth`) --
  full translation, switcher included, and the language picked on that page
  is carried into the new user's `ui_language` once signup gives a session.
- The "Language" setting in Settings & billing (`LanguageSettingsCard`) --
  changes `ui_language` immediately, app-wide, no reload or logout.
- App shell chrome: the 5 nav items, the "New" button and its 4 quick-action
  labels.
- **Order status labels, app-wide** -- `useOrderStatusLabel()` in
  `src/lib/i18n/app-labels.ts` is a single shared hook now used everywhere
  `orderStatusLabel()` used to be called directly (dashboard, orders list,
  order detail, staff, the daily work plan) **and** on `/t/$token` itself
  (PR L's own tracking page was still showing raw English status words --
  this fixes that gap too, since it's the same shared status dictionary).
  The database still stores the English status string; only the label
  shown is translated. `useRoleLabel()` (owner/manager/tailor) exists
  alongside it but isn't wired into every role `<Select>` yet.
- Owner-facing messages: daily/weekly digest text, the transfer-received
  alert, and their email subjects (`src/lib/digest-i18n.ts`) now resolve the
  shop owner's own `ui_language` (falling back to `stores.language`, then
  English) and are sent in that language, over both WhatsApp and Resend
  email. No change to the sending mechanism itself.
- Default measurement template field labels: `src/lib/i18n/template-labels.ts`
  ships the full translated dictionary for the ~27 distinct field keys across
  the 8 default templates (confirmed stable, seeded once via `jt_field()` in
  `20260920000252_...sql`) -- **not yet wired** into measurements-tab.tsx's
  render spots; a custom template's labels are untouched regardless, by
  design.

**What was deferred to PR M2** (now done, see below): the dashboard's
non-status text, the orders list/detail/order-form's non-status text,
clients + client profile, payments, payroll, inventory, shop + billing's
remaining copy.

**Still deferred after PR M2** (framework is ready for all of it -- it's
namespace content + wiring, not new infrastructure): onboarding's own
screens, the measurements tab's surrounding text (its *field labels* are
already translated via `template-labels.ts`, just not wired into the tab's
own render spots yet), reports, the rest of staff/team management, capacity
warnings and the on-time score, the Passport *import* side
(`/passport/share/$token` -- a staff-only utility page, not client-facing,
same call as PR L), events, quotations, contracts, AI tools, festive/moments,
consultations, `unmatched-payments.tsx`, and wiring `useRoleLabel()` into the
remaining role `<Select>`s. Three status-like badges were deliberately left
alone because they're different enums with no existing label map at all
(not a gap in wiring the existing hooks): a payroll **run**'s "Paid" badge,
a sew request's raw status (new/contacted/declined) on the Shop → Requests
tab, and a client "moment"'s raw status on the client profile's Messages tab.

Run `npm run lint:i18n` for a live count of what's left (see
`scripts/check-hardcoded-strings.mjs`) -- as of PR M2: **624 candidate
hardcoded strings across 88 files** (down from 860/99 at the end of PR M),
platform admin pages excluded by design (they stay English). This is a
heuristic scan (JSX text, label/placeholder/title/aria-label/description
props, `toast.*()` calls), not a strict AST-based i18n linter, so treat the
count as "roughly this much work remains" rather than an exact figure --
it's meant to be re-run by whoever picks up the next slice, to see progress
against today's baseline.

## PR M2: dashboard, orders, clients, payments, payroll, inventory, shop & billing

PR M2 finishes translating the ten screens the user asked about by name:
dashboard, orders list, order form, order detail, clients list, client
profile, payments, payroll, inventory, and the remaining untranslated parts
of settings (shop profile + billing). No new infrastructure -- same
`useAppT`/`AppI18nProvider` framework PR M shipped, 7 new namespaces plus
additions to the existing `app_settings` namespace:

- `app_dashboard` -- greeting, trial/message-usage banners, collection
  score advice, revenue/workroom charts, due-soon/uncollected sections,
  the "Grow with Business" locked-feature teasers, the staff "My jobs"
  view, and `DashboardOverview`'s search bar + stat tiles.
- `app_orders` -- shared by the orders list (tabs, empty state, Rush/no-date
  badges) and the order detail page (the full status-change dialog,
  delivery date editing, price/payments panel, fabric-received panel,
  materials-from-stock panel, cost & profit panel, measurements-used panel,
  payments/history lists, and the "Use from stock" dialog).
- `app_order_form` -- the entire 5-step New Order dialog/sheet: step
  labels, client search, garment/measurements/material steps (including the
  dynamically-built price-suggestion and fabric-estimate narrative text,
  now built from translated sentence fragments instead of one hardcoded
  template literal), price & review, and the measurement-reuse prompt.
- `app_clients` -- shared by the clients list, client profile (info rows,
  tabs, Style Book card, delete-confirmation dialog, moments empty state)
  and `client-form.tsx` (shared add/edit dialog).
- `app_payments` -- the payments list, method filter, and CSV export
  column headers (the downloaded file itself is now translated too).
- `app_payroll` -- the Run/Needs attention/Advances/Rates tabs, the rate
  editor, the needs-attention row's fix/void flow, and the record-advance
  panel. `STAGE_LABELS` (garment stage names) stays an external, English-only
  map in `src/lib/payroll.ts` for this PR -- flagged, not wired, since
  translating it is a larger, separate change to a file outside this PR's
  screens.
- `app_inventory` -- the items list, new-item/stock-in/adjust/history
  dialogs, and the movement-type labels. `CATEGORY_LABELS`/`UNIT_LABELS`
  (also in `src/lib/inventory.ts`) are the same kind of external map, same
  reason for staying English here.
- `app_settings` additions -- `shop.tsx`'s own copy (items/requests/profile
  tabs, the storefront empty state, publish/unpublish, sew-request summary
  text, the shop-profile form) and `billing.tsx`'s own copy (current-plan
  card, usage meters, trial notice, the plans list). The already-translated
  `LanguageSettingsCard` from PR M is untouched.

All seven new namespaces were added to `NAMESPACES` in
`src/lib/i18n/languages.ts`. Every new JSON file ships English plus
machine-drafted `pcm`/`ha`/`yo`/`ig` (same `_meta_status` flag, same review
process as every other section in this doc).

No database changes in PR M2 -- this is translation JSON + component wiring
only.

## What's out of scope for this round (Part 1)

- The tailor's own staff-facing screens (dashboard, orders, clients, etc.)
  stay English — that's Part 2 of this feature, a separate PR.
- `passport.share.$token.tsx` (the *importing* side of a Passport share) is a
  staff utility page a signed-in tailor uses, not a client-facing one, even
  though its URL lives under `/passport` — it's explicitly out of scope here,
  consistent with "staff screens are Part 2."
- Measurement template field labels (e.g. "Chest", "Waist" as configured by a
  shop) are shop-authored data, not translated in this PR. See the separate
  note in the PR description on whether they have stable keys for a future PR.
- Anything a shop or client actually typed themselves (shop bios, client
  notes, custom garment names, style notes) is never translated — it's their
  own words.

## PR U: Home dashboard and app shell

New keys only, same framework: 35 in `app_common` (sidebar and bottom-bar
labels, search, store switcher, profile menu, theme) and 97 in
`app_dashboard` (the rebuilt Home: figure cards, collections, Needs
attention, Recent payments, Fittings today, Who owes you, offline notice).
Four keys use i18next plurals (`_one` / `_other`): `fig_collected_sub`,
`fig_owed_sub`, `tag_overdue_days`, `owes_overdue_days`. The `pcm`, `ha`,
`yo` and `ig` values are machine drafts like the rest of these files and
need the same native-speaker review.
