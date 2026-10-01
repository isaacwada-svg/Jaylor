import { createFileRoute } from "@tanstack/react-router";

// Served for the Android Trusted Web Activity's Digital Asset Links check
// (see docs/play-store.md). Placeholders only -- the real SHA-256 signing
// certificate fingerprint comes from Google Play Console once the app is
// uploaded there, and gets pasted in below.
const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "ng.com.jaylor.app",
      sha256_cert_fingerprints: ["REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE"],
    },
  },
];

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(ASSET_LINKS), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
