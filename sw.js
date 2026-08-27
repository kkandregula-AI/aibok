/* Compendium — offline service worker.
   Caches the app shell on first load so the app works with no network afterward.
   Deploy this file in the SAME folder as the app's HTML. */
const CACHE = 'compendium-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      // add individually so one missing path can't abort the whole precache
      await Promise.allSettled(SHELL.map((u) => cache.add(u)));
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never touch the Anthropic API (POST) or any cross-origin request
  // (arXiv, DOI links, etc.) — those pass straight through to the network.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    if (cached) {
      // Serve cached instantly; refresh in the background when online.
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch (_) {}
      })());
      return cached;
    }

    // Not cached yet: fetch, cache a copy, and return it.
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      // Offline and uncached: for a page navigation, fall back to the app shell.
      if (req.mode === 'navigate') {
        const shell =
          (await cache.match('./', { ignoreSearch: true })) ||
          (await cache.match('./index.html', { ignoreSearch: true }));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
