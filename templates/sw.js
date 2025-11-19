const CACHE_PREFIX = 'mapbox-tiles';
const CACHE_VERSION = (() => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${CACHE_PREFIX}-${year}-${month}`;
})();
const MAPBOX_CACHE = CACHE_VERSION;
const MAPBOX_ALLOWED_HOSTS = new Set(['api.mapbox.com', 'events.mapbox.com']);

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith(`${CACHE_PREFIX}-`) && key !== MAPBOX_CACHE)
            .map(key => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const isMapboxTileHost = url.hostname.endsWith('.tiles.mapbox.com');
  const isAllowedMapboxHost = isMapboxTileHost || MAPBOX_ALLOWED_HOSTS.has(url.hostname);

  if (!isAllowedMapboxHost) {
    return;
  }

  event.respondWith(
    caches.open(MAPBOX_CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then(response => {
              if (response && response.ok) {
                cache.put(request, response.clone());
              }
            })
            .catch(() => undefined),
        );
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) {
          return cached;
        }
        return Response.error();
      }
    }),
  );
});
