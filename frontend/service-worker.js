// Bump this on every deploy that changes a precached file — activate then
// discards the old cache and takes over.
const CACHE_NAME = 'weight-tracker-v1';

const PRECACHE_URLS = [
  'index.html',
  'style.css',
  'app.js',
  'config.js',
  'manifest.json',
  'icon/icon-192.png',
  'icon/icon-512.png',
  'icon/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes

  const url = new URL(req.url);
  // Cross-origin (the Apps Script backend, Chart.js CDN, Google auth scripts)
  // is left entirely alone — always network. Data must never be served
  // stale, and the CDN scripts aren't useful offline anyway (the features
  // they power — real data, sign-in — need the network regardless).
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // The app shell itself: prefer the network (so a reload picks up a new
    // deploy), fall back to the cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // Static sub-resources: cache-first, fast and offline-capable.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
