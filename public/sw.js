// `validate:dist` replaces this token with a deployment-lane identity. Preview
// vNext caches can therefore never delete or reuse ordinary v1.2 caches.
const CACHE_CHANNEL = "__PWA_CACHE_CHANNEL__";
const CACHE_PREFIX = `parallette-25-${CACHE_CHANNEL}-`;
// `validate:dist` replaces this token with a fingerprint of every built JS/CSS
// asset. That makes the worker update whenever any eager or lazy Vite chunk does.
const BUILD_ID = "__PWA_BUILD_ID__";
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const base = new URL("./", self.registration.scope);
// The ordinary parent worker must not intercept the nested RC lane before its
// more-specific worker has installed. Without this exclusion, the first RC
// navigation could overwrite the v1 offline shell with RC HTML.
const VNEXT_RC_PATH = "/parallettes/vnext-rc/";
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
  if (manifest.buildId !== BUILD_ID || manifest.channel !== CACHE_CHANNEL || !Array.isArray(manifest.assets)) {
    throw new Error("Asset manifest and service worker build do not match");
  }

  const urls = [...new Set([...shell, ...manifest.assets.map(appUrl)])];
  const cache = await caches.open(CACHE);
  // Unhashed shell files must be fresh. Vite assets carry a content hash in
  // their name, so an HTTP-cached copy is byte-identical: reuse it instead of
  // downloading what the page has just fetched a second time.
  const hashedAssets = new URL("assets/", base).pathname;
  await cache.addAll(urls.map((url) => new Request(url, {
    cache: new URL(url).pathname.startsWith(hashedAssets) ? "default" : "reload",
  })));
  const cachedManifest = await (await cache.match(assetManifestUrl.href)).json();
  const cachedHtml = await (await cache.match(base.href)).text();
  if (cachedManifest.buildId !== BUILD_ID || cachedManifest.channel !== CACHE_CHANNEL
    || !cachedHtml.includes(`<meta name="p25-build-id" content="${BUILD_ID}"`)) {
    await caches.delete(CACHE);
    throw new Error("The update changed during download. Keep the previous complete version.");
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  // Do not call skipWaiting here. An update stays waiting until the old app has
  // no open clients, so a running workout is never replaced or reloaded midway.
});

self.addEventListener("activate", (event) => {
  // Keep old hashed assets while any older page may still be open. Claiming
  // does not reload pages; only the page that requested an update reloads.
  event.waitUntil(self.clients.claim());
});

const appClients = async () => (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
  .filter((client) => {
    const url = new URL(client.url);
    return url.origin === base.origin && url.pathname.startsWith(base.pathname)
      && !(CACHE_CHANNEL === "v1" && url.pathname.startsWith(VNEXT_RC_PATH));
  });

self.addEventListener("message", (event) => {
  const port = event.ports?.[0];
  if (!port || !event.source?.id) return;
  event.waitUntil((async () => {
    const clients = await appClients();
    if (!clients.some((client) => client.id === event.source.id)) return;
    if (event.data?.type === "P25_UPDATE_VERSION") {
      port.postMessage({ buildId: BUILD_ID });
      return;
    }
    if (event.data?.buildId !== BUILD_ID) { port.postMessage({ status: "changed" }); return; }
    if (clients.length !== 1 || clients[0].id !== event.source.id) {
      port.postMessage({ status: "other-windows" });
      return;
    }
    if (event.data.type === "P25_APPLY_UPDATE") {
      // Only an explicit safe-screen request, with no other app window open.
      await self.skipWaiting();
      port.postMessage({ status: "accepted", buildId: BUILD_ID });
    } else if (event.data.type === "P25_RELEASE_OLD_CACHES") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key)));
      port.postMessage({ status: "accepted" });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== base.origin || !requestUrl.pathname.startsWith(base.pathname)) return;
  if (CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // An installed worker serves its own complete shell, including offline.
      // Mixing a new HTML shell into the old build can break lazy imports.
      const shellResponse = await cache.match(base.href);
      if (shellResponse) return shellResponse;
      try {
        const response = await fetch(event.request);
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    // A page opened during activation may still reference the prior build.
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) {
        const retained = await (await caches.open(key)).match(event.request);
        if (retained) return retained;
      }
    }

    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
    return response;
  })());
});
