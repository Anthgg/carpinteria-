self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || 'Tu pedido tiene una actualización.' };
  }

  let destination = self.location.origin;
  const candidate = payload.data?.url || payload.url;
  try {
    const parsed = new URL(candidate, self.location.origin);
    if (parsed.origin === self.location.origin && parsed.pathname.startsWith('/seguimiento/')) destination = parsed.href;
  } catch { /* Ignore malformed destinations and keep the current site as the target. */ }

  const title = typeof payload.title === 'string' ? payload.title : 'Actualización del taller';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 180) : 'El avance de tu pedido cambió. Consulta el seguimiento para ver los detalles.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: typeof payload.icon === 'string' ? payload.icon : '/brand/carpinteria-360-logo.png',
    badge: typeof payload.badge === 'string' ? payload.badge : '/brand/carpinteria-360-logo.png',
    data: { url: destination },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || self.location.origin;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const exact = clients.find((client) => client.url === destination);
    if (exact) return exact.focus();

    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  }));
});
