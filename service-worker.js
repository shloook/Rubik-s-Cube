const CACHE_NAME = 'rubiks-cube-cache-v1';

// Install event: Skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch event: Network first, then cache, falling back to cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Try to fetch from network
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }

        // Clone response to cache it
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });

      // Return cached response immediately if available, otherwise wait for network
      // For a "offline-first" experience for static assets, we could return cachedResponse || fetchPromise
      // But for a mix of CDN and local, this strategy (Stale-while-revalidate logic) is safer:
      return cachedResponse || fetchPromise;
    }).catch(() => {
      // If both fail (offline and not in cache), usually we'd show a fallback
      // For now, we rely on the cache being populated.
    })
  );
});