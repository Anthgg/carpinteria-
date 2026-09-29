self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { message: event.data?.text() || 'Tu pedido tiene una actualización.' }; }
  const title = payload.type === 'stage' && payload.stage === 'READY' ? 'Tu pedido está listo' : 'Actualización del taller';
  const body = payload.message || 'El avance de tu pedido cambió. Consulta el seguimiento para ver los detalles.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: payload.url || self.location.origin },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || self.location.origin;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const client = clients.find((entry) => entry.url === destination) || clients.find((entry) => 'focus' in entry);
    if (!client) return self.clients.openWindow(destination);
    return client.navigate(destination).then(() => client.focus());
  }));
});
