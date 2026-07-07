// Kill-switch service worker.
// The minimal j-hn.info no longer uses a service worker. This version
// unregisters any previously-installed SW and clears its caches, then
// gets out of the way. It intercepts no requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
