// src/sw.js — własny service worker (strategia injectManifest)
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// registerType 'prompt': UpdatePrompt wysyła SKIP_WAITING po zgodzie użytkownika
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Chunki tras wyłączone z precache (globIgnores w vite.config.js) plus worker
// pdf.js, którego rozszerzenie .mjs nigdy nie łapało się na globPatterns —
// czyli precache trzymał 472 KB pdf.js bez workera, więc i tak nie działał
// offline. Tutaj wpadają do cache'u przy pierwszym użyciu: offline działa dla
// tras, które użytkownik faktycznie odwiedził, a pierwsze wejście ich nie ciągnie.
// Trasa rejestrowana po precacheAndRoute, więc nie przechwytuje precache'owanych.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin
    && url.pathname.startsWith('/assets/')
    && (request.destination === 'script' || url.pathname.endsWith('.mjs')),
  new StaleWhileRevalidate({ cacheName: 'app-chunks' }),
);

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
