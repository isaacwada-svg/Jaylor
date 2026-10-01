# Play Store readiness (Android, via Trusted Web Activity)

Jaylor ships to Google Play as a **Trusted Web Activity (TWA)**: a thin Android
wrapper that opens the existing web app full-screen, with no native rebuild.
This doc covers building that wrapper with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap),
wiring up Digital Asset Links so it opens without a Chrome address bar, and
what Play Console will ask for at listing time.

## 1. Build the Android package (.aab) with Bubblewrap

Bubblewrap needs Node.js and a JDK; it downloads its own copy of the Android
SDK/build tools on first run if none is found.

```bash
npm install -g @bubblewrap/cli

# Point it at the production manifest -- it reads name, icons, theme/background
# colors and start_url straight from there.
bubblewrap init --manifest=https://jaylor.com.ng/manifest.json
```

`init` asks a series of questions; answer with:

| Prompt | Answer |
| --- | --- |
| Domain | `jaylor.com.ng` |
| Application name | `Jaylor` |
| Short name | `Jaylor` |
| Package name | `ng.com.jaylor.app` (see note below) |
| Display mode | `standalone` |
| Status bar color / Theme color | `#111F39` (pulled from the manifest automatically) |
| Splash screen color / Background color | `#F8F4E9` (pulled from the manifest automatically) |
| Icon URL | pulled from the manifest's `icons` automatically (both `any` and `maskable` purposes exist now — see §3) |
| Signing key | let Bubblewrap generate a new keystore the first time (`android.keystore`) unless Bethjay already has one from a previous attempt — **back this keystore up somewhere durable**; losing it means losing the ability to publish updates to the same app listing |

**Package name**: the spec calls for `ng.com.jaylor.app` and nothing in the
codebase conflicts with it (no existing Android package registered anywhere
in this repo) — Bubblewrap will use it unless you have a reason to pick
something else before the first-ever release (the package name can never be
changed after the first Play Console upload).

Build the signed `.aab`:

```bash
bubblewrap build
```

This produces `app-release-bundle.aab` (upload this to Play Console) and
`app-release-signed.apk` (useful for installing directly on a test device via
`adb install`) in the project directory, plus prints the **SHA-256
certificate fingerprint** of the keystore it just signed with.

To regenerate the wrapper later (e.g. after changing the manifest's colors or
icons), re-run `bubblewrap update` followed by `bubblewrap build` rather than
`init` again (init would try to create a second keystore).

## 2. Digital Asset Links: inserting the real fingerprint

`/.well-known/assetlinks.json` is already served correctly (see §3) with a
placeholder fingerprint. Two different fingerprints matter here, and Play
Console's default signing path means they are **not the same one**:

1. **Your local upload keystore's fingerprint** (what `bubblewrap build`
   printed, or `keytool -list -v -keystore android.keystore -alias android`) —
   this is only the key that signs the `.aab` you *upload*.
2. **Play App Signing's fingerprint** — once Play Console accepts your first
   upload, it re-signs the app for distribution with its own key (this is
   Google's default "Play App Signing" program, which the Play Console setup
   flow will have you opt into). **This second fingerprint — found in Play
   Console under App integrity → App signing → App signing key certificate —
   is the one that must go into `assetlinks.json`**, not your local upload
   key's. Using the upload key's fingerprint instead is the single most common
   reason a TWA falls back to showing a Chrome address bar on real devices
   despite "working" in local testing.

Steps:

```bash
# 1. Upload the .aab to Play Console (Internal testing track is fine to start).
# 2. Once Play Console shows the app, open:
#    App integrity -> App signing -> App signing key certificate -> SHA-256
# 3. Copy that fingerprint into src/routes/[.]well-known/assetlinks[.]json.ts,
#    replacing REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE.
# 4. Deploy the site so the change goes live at
#    https://jaylor.com.ng/.well-known/assetlinks.json
# 5. Verify Google can see it:
```

```bash
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://jaylor.com.ng&relation=delegate_permission/common.handle_all_urls"
```

A successful response echoes back your `assetlinks.json` entry. If it comes
back empty, double-check there's no redirect on the URL (there shouldn't be —
see §3) and that the fingerprint has no stray whitespace.

You can also use `bubblewrap validate` or Android Studio's "Asset Links Tool"
inside the installed app for an on-device check.

## 3. What this PR changed to support the TWA

- **`public/manifest.json`**: added `"scope": "/"` (required by Bubblewrap/TWA
  tooling; was missing). Split the icon list so `icon-192.png`/`icon-512.png`
  keep `purpose: "any"` and two new files, `icon-192-maskable.png` /
  `icon-512-maskable.png`, carry `purpose: "maskable"`. The original icons
  were full-bleed artwork with no safe-zone padding — combined into one `"any
  maskable"` entry (the previous setup) they'd have been clipped badly by
  Android's circular/squircle adaptive-icon mask. The new maskable-specific
  files pad the same artwork down to fit inside the standard 80% safe zone on
  a solid background sampled from the artwork's own navy (`#111F39`, which is
  also the manifest's `theme_color`), so nothing of the mark is lost when
  masked. `start_url` (`/dashboard`) and the lack of a separate signed-out
  landing needed no change: `/_authenticated`'s existing route guard already
  redirects a signed-out visitor to `/auth` before anything renders, so the
  "sensible landing for signed-out users" requirement was already satisfied.
- **`public/sw.js`**: previously had **no offline fallback at all** — it
  explicitly skipped navigation requests (`request.mode === "navigate"`),
  meaning a hard/cold load while offline (e.g. opening the installed app with
  no signal) fell through to Chrome's native "no internet" page, not
  anything Jaylor-branded. Now navigation requests are still network-first
  (a page is never served from a stale cache — unchanged from before), but if
  the network fetch itself fails outright, it falls back to a new cached
  `public/offline.html`. **What the service worker caches, in full**: same-origin
  `image`/`font`/`style`/`script` requests (cache-first, i.e. compiled JS/CSS
  chunks and static images — this is what makes the translation-namespace
  JSON files from the local-languages PRs work offline too, since they
  compile to JS chunks, not raw fetches) plus `offline.html` and
  `icon-192.png` (pre-cached on install, for the fallback above). It never
  caches a navigation response, an API/XHR response, or anything
  user/store-specific — the existing invariant that "a transient 500 or
  another account's response can never become a persistent dashboard screen"
  is unchanged. This also means the service worker doesn't interfere with the
  offline outbox (`src/lib/offline/outbox.ts`, a separate IndexedDB-based
  queue for writes made while offline) or with auth (Supabase session
  handling is ordinary `fetch`/`connect-src` traffic, never a navigation
  request, so it's never touched by the cache-first or fallback logic above).
- **`src/routes/[.]well-known/assetlinks[.]json.ts`** (new): serves
  `/.well-known/assetlinks.json` with `Content-Type: application/json` and no
  redirect. This needed a server route rather than a `public/` static file:
  TanStack Start's file-based router scans `src/routes` for files, and a
  literal dot-prefixed directory (`.well-known`) is treated as hidden and
  silently skipped by that scan — confirmed by testing (the route didn't
  appear in the generated route tree until the directory itself was renamed
  to `[.]well-known`, using the same bracket-escape convention this codebase
  already uses for `src/routes/sitemap[.]xml.ts`). Verified locally: `curl -i`
  returns `200`, `content-type: application/json`, no `Location` header.
  Ships with a placeholder package name/fingerprint — see §2 to fill in the
  real ones once Play Console issues them.
- **Account deletion** (`src/routes/delete-account.tsx`, new): the existing
  "Privacy and data" page (`/_authenticated/privacy.tsx`) only covered this
  for signed-in store owners ("Close your store" → contact support), which
  doesn't satisfy Play's requirement for a page reachable **without**
  installing the app or signing in. The new `/delete-account` page (same
  `LegalLayout` as `/privacy-policy` and `/terms`) explains who it's for,
  how to request deletion (in-app path and a no-login path via email/
  WhatsApp), exactly what gets deleted, what may be retained and why
  (payment/tax records, active disputes), and the expected timeframe. Both
  `/_authenticated/privacy.tsx` and `/privacy-policy.tsx` now link to it, so
  it's reachable both signed in and signed out, per the spec's "both inside
  the app and through a public web page."
- **Android in-app behaviour** (checked, no code changes needed beyond the
  above): `wa.me` links already open via `window.open(..., "_blank",
  "noopener,noreferrer")` or a plain `<a target="_blank" rel="noreferrer">` —
  standard links/window.open, which Android already resolves to the
  WhatsApp app when it's installed, with or without a TWA in the picture.
  Paystack checkout is a full-page `window.location.href` redirect (never an
  iframe or popup), which works the same inside a TWA as in any browser tab,
  and returns to Jaylor's own origin afterwards via `callbackUrl` — once §2's
  asset-link verification is live, that return trip reopens inside the TWA
  rather than a normal browser. Camera capture for fabric/style/progress
  photos uses a plain `<input type="file" accept="image/*"
  capture="environment">` (`material-photo-manager.tsx`), which is standard
  HTML already permitted by the existing `Permissions-Policy: camera=(self)`
  header (`src/start.ts`) — no TWA-specific wiring required. External links
  (storefront shares, style previews, uploaded files) were audited: every
  `target="_blank"` anchor in the app already carries `rel="noreferrer"` or
  `rel="noopener noreferrer"` except two internal `<Link>`s to Jaylor's own
  routes (`/privacy-policy`, `/$handle`), which don't need it since they're
  same-origin. **`tel:` links**: there are currently none anywhere in the
  app — every phone number shown is plain text, and the one actual contact
  mechanism built throughout is WhatsApp (`wa.me`), by original design
  for this market. Nothing to fix here since nothing exists to break; flagging
  in case a future PR wants tap-to-call as well.

## 4. Play Console checklist

Everything Play Console's listing flow will ask for, and where to get it:

| Item | Where it comes from |
| --- | --- |
| Signed `.aab` | §1, `bubblewrap build` |
| Package name | `ng.com.jaylor.app` |
| App name | Jaylor |
| Short description (≤80 chars) | e.g. "Orders, measurements and payments for tailors — tracked on WhatsApp." |
| Full description (≤4000 chars) | Expand on the manifest's own description ("Every order tracked. Every naira collected.") plus the homepage's positioning copy (`src/routes/index.tsx` / `JOB_LANDING_CONTENT`) |
| App icon (512×512, 32-bit PNG) | `public/icon-512.png` — already alpha-free RGB, usable as-is |
| Feature graphic (1024×500) | `docs/play-store-assets/feature-graphic-placeholder.png` (new, generated this PR from the existing brand mark) — a real, spec-sized placeholder, not a mockup; swap for a designer's version if you want something more polished before launch, but it's safe to ship as-is |
| Phone screenshots (min. 2, ideally 4–8) | Not generated by this PR — needs real screenshots of the running app. Chrome DevTools' device-mode (set to a Pixel-class phone width) against the deployed site covers this without a physical device |
| Privacy policy URL | `https://jaylor.com.ng/privacy-policy` (already live) |
| Account deletion URL | `https://jaylor.com.ng/delete-account` (new, this PR) |
| Content rating questionnaire | Business/productivity tool, no user-generated content visible to strangers (storefront items are shop-authored product listings, not public social content), no violence/gambling/mature themes — expect "Everyone" once the questionnaire is answered honestly |
| Target audience | Not directed at children; this is a B2B tool for tailoring businesses |
| Data safety form | See table below |
| Contact details | `info@jaylor.com.ng` (`SUPPORT_EMAIL` in `src/lib/jaylor.ts`) |

### Data safety form answers (based on what Jaylor actually collects)

Derived from reading the code, not guessed — matches `src/routes/privacy-policy.tsx`:

| Data type | Collected? | Shared with third parties? | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Name, email, phone | Yes | No (only with processors: Supabase for hosting/auth, Paystack for payment processing, WhatsApp for messaging a shop's own clients, Resend for transactional email) | Account functionality | Required to create and secure an account |
| Business records (clients, measurements, orders, payments, consultations, events, expenses) | Yes | No | App functionality | Entered by the store itself; the store is the data controller, Jaylor is the processor (see Privacy Policy) |
| Photos (fabric, style references, progress) | Yes, via camera or gallery picker | No | App functionality | Stored in private Supabase Storage buckets, never public by default |
| Financial info (payment amounts, Paystack transaction references) | Yes | Paystack (payment processor, necessary to process the payment itself) | App functionality, account functionality | Card details themselves are handled entirely by Paystack's hosted checkout — Jaylor never sees or stores card numbers |
| Location | **Not collected** | — | — | City/state/area are plain typed text fields on a store's profile, not device geolocation — no `navigator.geolocation` call anywhere in the app |
| App activity / analytics | Optional, consent-gated | Google Analytics, Microsoft Clarity | Analytics | Both load only after a visitor taps "Accept All" on the cookie banner; IP is anonymized; see the Privacy Policy's "Essential storage and optional analytics" section |
| Data encrypted in transit | Yes | — | — | HTTPS/TLS throughout (Supabase + the app's own hosting) |
| Users can request data deletion | Yes | — | — | `https://jaylor.com.ng/delete-account` |

## 5. Manual test items (for a real Android device/emulator)

- Install the PWA from Chrome ("Add to Home screen" / the in-app install
  prompt) and confirm it opens standalone with the right icon (including that
  the maskable icon isn't clipped oddly on devices with circular icon masks)
  and the navy/cream theme colors.
- Install the signed `.aab` (via `bubblewrap build` → `adb install
  app-release-signed.apk`, or an Internal Testing track link) once
  `assetlinks.json` carries the real Play-App-Signing fingerprint, and
  confirm it opens with **no Chrome address bar** (that's the actual sign the
  asset link verified correctly — if a URL bar shows up, the fingerprint is
  wrong, most likely the upload-key-vs-app-signing-key mixup from §2).
- From inside the installed app: tap a WhatsApp reminder/tracking-link button
  and confirm it opens the WhatsApp app directly; start a Paystack payment
  and confirm the hosted checkout loads and returns to the app afterwards;
  take a fabric/style photo via the camera button in the order form or an
  order's material section.
- Turn on airplane mode, force-close and reopen the installed app, and
  confirm the offline fallback page appears instead of a blank/native error
  screen; turn connectivity back on and confirm a normal reload works.
- Load `https://jaylor.com.ng/.well-known/assetlinks.json` directly in a
  browser and confirm it returns JSON (not a redirect or HTML error page).
- Load `https://jaylor.com.ng/delete-account` in a private/incognito window
  (signed out) and confirm it's fully readable without logging in.
