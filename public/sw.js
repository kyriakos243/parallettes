const CACHE_PREFIX = "parallette-25-";
// `validate:dist` replaces this token with a fingerprint of every built JS/CSS
// asset. That makes the worker update whenever any eager or lazy Vite chunk does.
const BUILD_ID = "__PWA_BUILD_ID__";
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const base = new URL("./", self.registration.scope);
const assetManifestUrl = new URL("asset-manifest.json", base);
const shell = [
  base.href,
  assetManifestUrl.href,
  new URL("manifest.webmanifest", base).href,
  new URL("icon-192.png", base).href,
  new URL("icon-512.png", base).href,
  new URL("apple-touch-icon.png", base).href,
];

const appUrl = (value) => {
  const url = new URL(value, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error(`Refusing to cache an out-of-scope asset: ${url.href}`);
  }
  return url.href;
};

const precache = async () => {
  const response = await fetch(assetManifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Asset manifest request failed: ${response.status}`);
  const manifest = await response.json();
  if (manifest.buildId !== BUILD_ID || !Array.isArray(manifest.assets)) {
    throw new Error("Asset manifest and service worker build do not match");
  }

  const urls = [...new Set([...shell, ...manifest.assets.map(appUrl)])];
  const cache = await caches.open(CACHE);
  await cache.addAll(urls.map((url) => new Request(url, { cache: "reload" })));
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  // Do not call skipWaiting here. An update stays waiting until the old app has
  // no open clients, so a running workout is never replaced or reloaded midway.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== base.origin || !requestUrl.pathname.startsWith(base.pathname)) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(base.href, response.clone());
        return response;
      } catch {
        return (await cache.match(base.href)) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) {
      event.waitUntil(fetch(event.request).then(async (response) => {
        if (response.ok) await cache.put(event.request, response.clone());
      }).catch(() => undefined));
      return cached;
    }

    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
    return response;
  })());
});
