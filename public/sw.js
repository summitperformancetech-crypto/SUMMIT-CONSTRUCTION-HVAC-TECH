// Hand-rolled service worker, not a framework plugin (next-pwa/serwist
// have known Turbopack compatibility gaps as of Next.js 16 - this app's
// active bundler per its own build output). Deliberately simple and
// honest about what it does: runtime caching (stale-while-revalidate) of
// pages/assets as they're actually visited/fetched while online, not a
// build-time precache of the whole app. A field tech who has already
// opened a project while online can reopen it with no signal; a page
// never visited before going offline is not magically available - that
// would be a false "the whole app works offline" claim this comment
// exists specifically to not make.
//
// Data writes (Supabase mutations) are handled separately by
// lib/offlineQueue.ts on the client - this service worker only handles
// GET requests (pages, JS/CSS bundles, images). It never intercepts
// POST/PATCH/DELETE, so a queued write goes straight to the real
// network layer (and fails/queues there) rather than being silently
// swallowed by a cache strategy meant for read requests.

const CACHE_NAME = "summit-runtime-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever cache GET requests - a mutation must always hit the real
  // network (or fail loudly so lib/offlineQueue.ts can catch it and
  // queue it), never be served a stale cached response.
  if (request.method !== "GET") return;

  // Never cache Supabase API calls (auth/data) - those need to be either
  // genuinely live or explicitly handled by the offline queue, never
  // silently served stale from this generic cache.
  const url = new URL(request.url);
  if (url.hostname.endsWith(".supabase.co")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      // Stale-while-revalidate: return the cached copy immediately if we
      // have one (works offline), refresh the cache in the background
      // when online. No cached copy and offline -> the network attempt's
      // own failure is what the caller sees, an honest "not available
      // offline" rather than a fabricated empty success.
      return cached ?? (await networkFetch) ?? Response.error();
    }),
  );
});
