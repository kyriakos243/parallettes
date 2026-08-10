const CACHE = "parallette-25-v7";
const base = new URL("./", self.registration.scope);
const shell = [
  base.href,
  new URL("manifest.webmanifest", base).href,
  new URL("icon-192.png", base).href,
  new URL("icon-512.png", base).href,
  new URL("apple-touch-icon.png", base).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(shell);
    // Cache the current hashed CSS/JS bundle during installation so the very
    // first successful visit is enough for a later offline Home Screen launch.
    const html = await fetch(base.href).then((response) => response.text());
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)]
      .map((match) => new URL(match[1], base))
      .filter((url) => url.origin === base.origin && url.href.startsWith(base.href))
      .map((url) => url.href);
    await cache.addAll([...new Set(assets)]);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(base.origin)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(base.href, copy));
        }
        return response;
      }).catch(() => caches.match(base.href)),
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      event.waitUntil(fetch(event.request).then((response) => {
        if (response.ok) return caches.open(CACHE).then((cache) => cache.put(event.request, response));
        return undefined;
      }).catch(() => undefined));
      return cached;
    }
    const response = await fetch(event.request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  })());
});
