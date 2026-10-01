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

Sections (8 total): `common`, `tracking`, `approval`, `passport`, `directory`, `storefront`, `quotes`, `events`.

So there are 5 languages × 8 sections = **40 files**. Every file has exactly the
same set of keys (214 keys per language, checked below) — only the English
file is the source of truth for which keys exist; a translated file should
never add or remove a key, only change the value.

## String counts per file (identical across all 5 languages)

| Section      | Keys | Shipped in |
| ------------ | ---- | ---------- |
| common       | 17   | PR L (+8 order-status keys added in PR M) |
| tracking     | 16   | PR L |
| approval     | 23   | PR L |
| passport     | 63   | PR L |
| directory    | 6    | PR L |
| storefront   | 13   | PR L |
| quotes       | 22   | PR L |
| events       | 62   | PR L |
| auth         | 40   | PR M |
| app_common   | 28   | PR M |
| app_settings | 2    | PR M |
| **Total**    | **292** | |

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

**What's deliberately deferred to a follow-up PR** (framework is ready for
all of it -- it's namespace content + wiring, not new infrastructure):
onboarding's own screens, the dashboard's non-status text, the orders
list/detail/order-form's non-status text, clients + client profile, the
measurements tab's surrounding text, payments, payroll, reports, the rest of
staff/team management, billing's plan cards, capacity warnings and the
on-time score, the Passport *import* side (`/passport/share/$token` -- a
staff-only utility page, not client-facing, same call as PR L), events,
quotations, contracts, inventory, AI tools, festive/moments, consultations,
and wiring `useRoleLabel()` into the remaining role `<Select>`s.

Run `npm run lint:i18n` for a live count of what's left (see
`scripts/check-hardcoded-strings.mjs`) -- as of this PR: **860 candidate
hardcoded strings across 99 files**, platform admin pages excluded by design
(they stay English). This is a heuristic scan (JSX text, label/placeholder/
title/aria-label/description props, `toast.*()` calls), not a strict
AST-based i18n linter, so treat the count as "roughly this much work remains"
rather than an exact figure -- it's meant to be re-run by whoever picks up
the next slice, to see progress against today's baseline.

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
