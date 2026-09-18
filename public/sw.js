// Service worker: PWA instalable + avisos push reales.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Ojo: ACÁ NO VA UN HANDLER DE 'fetch'.
//
// Antes había uno que hacía `event.respondWith(fetch(event.request))`, o sea
// interceptaba TODAS las requests de la app solo para volver a pedirlas igual.
// Eso no agrega nada y sí rompe cosas: el navegador pierde el manejo nativo
// de los pedidos por rango (los <video>), de las redirecciones y del caché de
// navegación hacia atrás, y cada pedido se paga dos veces. Para que la app sea
// instalable no hace falta ningún handler de fetch desde Chrome 89.

// Llega cuando el server manda un push (aunque la app esté cerrada). El
// payload lo arma lib/webPush.ts en el server con { title, body, url }.
self.addEventListener('push', (event) => {
  let data = { title: 'No Te Afanen', body: 'Bajó el precio de algo que seguís.' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'price-drop',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Al tocar la notificación: si ya hay una pestaña abierta la enfoca, si no
// abre una nueva en la URL del aviso.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
