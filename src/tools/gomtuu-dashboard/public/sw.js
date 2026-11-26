// Shell-only caching: makes the dashboard installable and able to open
// offline, without ever risking stale telemetry. /snapshot.json and
// /stream (live readings) are explicitly never cached -- they always hit
// the network, or fail outright offline, rather than silently serving old
// readings as if they were current.
const CACHE_NAME = "gomac-dashboard-shell-v1";
const NEVER_CACHE_SUFFIXES = ["/snapshot.json", "/stream"];

self.addEventListener("install", () => {
  self.skipWaiting();
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
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (NEVER_CACHE_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix))) return;

  // Network-first, caching whatever succeeds, so an online visitor always
  // gets the latest deploy; only falls back to the cache when the network
  // request itself fails (offline, or TheFlea unreachable).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
  );
});
