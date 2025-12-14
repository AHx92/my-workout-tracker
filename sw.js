// Service Worker for My Workout Tracker PWA
// Handles offline functionality and caching

const CACHE_NAME = 'my-workout-tracker-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/offline.js',
  '/manifest.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip Google Apps Script API calls from caching
  if (request.url.includes('script.google.com')) {
    return event.respondWith(fetch(request));
  }
  
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          console.log('[ServiceWorker] Serving from cache:', request.url);
          return response;
        }
        
        return fetch(request).then((response) => {
          // Don't cache if not a success response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });
          
          return response;
        });
      })
  );
});

// Background sync for pending workouts
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync triggered');
  if (event.tag === 'sync-workouts') {
    event.waitUntil(syncPendingWorkouts());
  }
});

async function syncPendingWorkouts() {
  // This will be called from offline.js
  console.log('[ServiceWorker] Syncing pending workouts...');
  // Broadcast message to all clients to trigger sync
  const allClients = await self.clients.matchAll();
  allClients.forEach(client => {
    client.postMessage({ type: 'SYNC_WORKOUTS' });
  });
}
