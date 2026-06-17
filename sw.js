// SecureChat Service Worker v2 — con notificaciones push
const CACHE = 'securechat-v2';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ─── Recibir notificación push
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'SecureChat', {
      body:    data.body  || 'Alguien quiere chatear contigo',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     'securechat-incoming',
      renotify: true,
      data:    { phone: data.phone }
    })
  );
});

// ─── Al tocar la notificación → abrir la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) {
        list[0].focus();
        list[0].postMessage({ type: 'incoming_call', phone: e.notification.data.phone });
      } else {
        clients.openWindow('/');
      }
    })
  );
});
