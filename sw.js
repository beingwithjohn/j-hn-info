// Service worker — caches the page + its images so j-hn.info works offline.
// Cache name is versioned; bump it when shipping changes that should invalidate.
const CACHE = 'j-hn-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/images/right-inline.png',
  '/images/left-inline.png',
  '/images/down-inline.png',
  '/images/favicon-32.png',
  '/images/favicon-180.png',
  '/images/favicon-512.png',
  '/images/og.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle same-origin GET requests; let third-party calls (Last.fm,
  // Google Fonts, RSS proxy) pass through normally.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Network-first for the HTML so updates ship instantly when online,
  // cache fallback when offline.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for assets.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
