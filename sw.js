const CACHE = 'first-look-v6';
const ASSETS = ['./', './index.html', './styles.css?v=5', './company-catalog.js?v=1', './cv-evaluator.js?v=1', './app.js?v=7', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const jobId = data.jobId || 'first-look-role';
  const applyUrl = data.applyUrl || data.url || './#matches';
  event.waitUntil(self.registration.showNotification(data.title || 'New finance role', {
    body: data.body || 'A matching role is ready to review.',
    icon: './icon.svg',
    tag: jobId,
    renotify: false,
    data: {
      url: applyUrl,
      jobId,
      discoverySource: data.discoverySource || 'unknown',
      matchTier: data.matchTier || 'possible',
    },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
