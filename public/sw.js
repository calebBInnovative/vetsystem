// VetSystem Service Worker
// Handles notification clicks and keeps the push notification pipeline alive.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Web push (Firebase Cloud Messaging, data-only messages). The server sends
// { title, body, url, tag } — e.g. a new manual payment for the platform owner.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { return; }
  const data = payload.data ?? payload;
  if (!data.title) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body ?? '',
      tag:  data.tag,
      icon: '/logo.jpeg',
      data: { url: data.url ?? '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing tab if one is open
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) client.navigate(url);
            return;
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow(url);
      })
  );
});
