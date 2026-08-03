const CACHE_NAME = "erp-rodis-static-v1";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Ne met en cache QUE les fichiers statiques versionnes (JS/CSS buildes,
// icones). Les pages, API et server actions passent toujours par le reseau
// - jamais de cache pour les donnees de stock/commandes, pour ne pas servir
// une version perimee ou partagee entre utilisateurs sur un meme appareil.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isStaticAsset = STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
  );
});
