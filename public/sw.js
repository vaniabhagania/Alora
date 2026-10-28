// Alora service worker — only handles Web Push reminders (no offline caching).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Alora';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: 'alora-daily-digest', // a newer digest replaces the old one instead of stacking
    data: { url: data.url || self.registration.scope },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(target); } catch { /* cross-origin */ } } return; }
    }
    await self.clients.openWindow(target);
  })());
});
