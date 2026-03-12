self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = String(payload.title || 'BMS App');
  const body = String(payload.body || '');
  const tag = String(payload.tag || 'bms-push');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: payload.data || {},
      icon: 'https://mlcdn-e5aygudafwh4e7gs.z02.azurefd.net/bmsapp/icon-180.png',
      badge: 'https://mlcdn-e5aygudafwh4e7gs.z02.azurefd.net/bmsapp/icon-180.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (clients.openWindow) {
      await clients.openWindow(`${self.registration.scope}timeline`);
    }
  })());
});
