const CACHE = 'first-look-v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))));
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New finance role', body: 'A matching role is ready to review.' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icon.svg', data: { url: data.url || './#matches' } }));
});
self.addEventListener('notificationclick', (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data.url)); });
