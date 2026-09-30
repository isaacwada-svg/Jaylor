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

| Section      | Keys |
| ------------ | ---- |
| common       | 9    |
| tracking     | 16   |
| approval     | 23   |
| passport     | 63   |
| directory    | 6    |
| storefront   | 13   |
| quotes       | 22   |
| events       | 62   |
| **Total**    | **214** |

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
