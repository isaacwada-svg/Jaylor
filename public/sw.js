const CACHE_NAME = "jaylor-static-v4";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Pre-cache just enough to render the offline fallback page itself (its
  // own markup is self-contained/inlined, so this is the only asset it needs).
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .catch(() => {
        // Best-effort -- install should never hard-fail because of this.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network-first, always -- a page (and the auth/session state it
    // depends on) must never be served from a stale cache. The cached
    // OFFLINE_URL page is only a fallback for when the network request
    // itself fails outright (no connectivity), never a substitute for a
    // real page the network could still deliver (e.g. a 404 or 500 still
    // comes from the network, untouched).
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // Cache only versioned public assets. App pages and private business data
  // must always come from the network so a transient 500 or another account's
  // response can never become a persistent dashboard screen.
  if (!["image", "font", "style", "script"].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
