const CACHE_VERSION = "pesanlunas-shell-v021";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
// Dynamic app/API traffic is deliberately NOT intercepted.
// Supabase/Next data should travel directly over the network without an extra SW fetch layer.
