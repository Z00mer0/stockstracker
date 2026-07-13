// src/sw.js — własny service worker (strategia injectManifest)
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// registerType 'prompt': UpdatePrompt wysyła SKIP_WAITING po zgodzie użytkownika
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// runtime cache NBP — jak dotąd w generateSW
registerRoute(
  ({ url }) => url.origin === 'https://api.nbp.pl',
  new NetworkFirst({ cacheName: 'nbp-cache', plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600 })] }),
);

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { /* pusty payload */ }
  event.waitUntil(self.registration.showNotification(data.title || 'MyFund', {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
