// Service worker: PWA instalable + avisos push reales + un caché mínimo
// para que la app abra (aunque sea con datos viejos) sin señal.
//
// Subite la versión acá cada vez que cambie STATIC_ASSETS o la estrategia de
// abajo: es lo único que hace que los clientes viejos borren su caché.
const CACHE_VERSION = 'nta-v3';
const SHELL_CACHE = `nta-shell-${CACHE_VERSION}`;
const API_CACHE = `nta-api-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, API_CACHE];

// Assets con nombre fijo (no llevan hash de build), así que cachearlos acá
// no se rompe en el próximo deploy. Los JS/CSS de Next SÍ llevan hash en el
// nombre — si algún día se agregan, van con una cache-busting estrategia
// aparte, no en esta lista a mano.
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/hero-cart.webp',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/logos/carrefour.webp',
  '/logos/changomas.webp',
  '/logos/coto.webp',
  '/logos/dia.webp',
  '/logos/disco.webp',
  '/logos/farmacity.svg',
  '/logos/jumbo.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      // Si un solo asset falla (404, red cortada a mitad de instalación) no
      // queremos que el SW entero quede sin instalar — mejor arrancar con lo
      // que se pudo cachear que sin nada.
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k)))
      ),
    ])
  );
});

// Ojo con lo que se toca acá: antes NO había ningún handler de 'fetch', a
// propósito (ver el motivo de fondo un poco más abajo). Este handler sigue
// esa misma lógica — no intercepta todo, solo tres casos puntuales — para no
// pisar el manejo nativo del navegador en todo lo demás:
//
//   1. Los assets fijos de STATIC_ASSETS: cache-first, con la red como
//      respaldo (y actualizando el caché en segundo plano). Son imágenes
//      chicas que casi no cambian; ahorra red y funcionan sin conexión.
//   2. Las navegaciones (entrar a la app / recargar): network-first, así
//      siempre se ve la versión más nueva cuando hay señal, pero si la red
//      falla se sirve la última página que quedó guardada en vez de la
//      pantalla de error del navegador.
//   3. Todo `/api/*` (menos `/api/cron/*`, ver isApiRequest): también
//      network-first. La red SIEMPRE gana cuando hay señal (nunca queremos
//      mostrar un precio viejo pudiendo traer uno fresco) — pero si falla a
//      mitad de sesión, se devuelve la última respuesta buena que quedó
//      guardada para ese pedido puntual, en vez de que la promesa reviente y
//      la pantalla se quede sin nada. Complementa al fallback que ya existe
//      en lib/catalogCache.ts (ese guarda el catálogo ya armado en
//      localStorage; este cachea la respuesta cruda de cada pedido a la
//      API) — con los dos, tanto el primer catálogo que se pinta como una
//      búsqueda nueva mientras estás sin señal tienen de dónde sacar algo.
//
// Todo lo que no entra en esos tres casos (dominios externos, JS/CSS con
// hash de build) ni siquiera pasa por acá: `fetch` no dispara este listener
// para nada que el código de abajo no capture con `event.respondWith`, así
// que sigue yendo directo a la red como si el service worker no existiera.
function isStaticAsset(url) {
  return url.origin === self.location.origin && STATIC_ASSETS.includes(url.pathname);
}

// Cualquier GET a nuestra propia API entra en el network-first genérico,
// CON UNA EXCEPCIÓN: /api/cron/*. Ese endpoint lo llama la infraestructura
// de Vercel con un secreto en el header Authorization (ver
// app/api/cron/snapshot-prices/route.ts) — nunca el navegador de una
// persona usando la app —, así que en la práctica este service worker jamás
// lo va a interceptar. Lo excluimos igual, explícito, para no depender de
// "en la práctica": si alguna vez algo lo llamara desde el cliente, no
// queremos una respuesta de ese endpoint (ni un 401) cacheada bajo esa URL.
function isApiRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/api/')) return false;
  return !url.pathname.startsWith('/api/cron/');
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/');
  }
}

// Igual estrategia que networkFirstNavigation, pero contra API_CACHE y sin
// el fallback a '/' (acá no hay una "respuesta por defecto" razonable si no
// está cacheado justo ESE pedido — mejor dejar que el error suba y que
// lib/catalogCache.ts se ocupe de mostrar el catálogo viejo completo).
async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('sin red y sin caché para este pedido');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET solamente: nunca queremos meternos en un POST/PUT (ni tiene sentido
  // cachearlo). Y nada con Range: eso es exactamente lo que rompía la
  // reproducción de <video> con el handler viejo — de esto no nos salvamos
  // solo con no tocar la ruta, el header hay que respetarlo siempre.
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstNavigation(request));
  }

  // Cualquier otra cosa (dominios externos, JS/CSS con hash de build) no
  // entra acá: no se llama a respondWith y el pedido sigue de largo,
  // manejado 100% por el navegador — mismo comportamiento que antes.
});

// Motivo de fondo de por qué el handler de arriba es angosto a propósito:
//
// Antes había uno que hacía `event.respondWith(fetch(event.request))` para
// TODAS las requests, solo para volver a pedirlas igual. Eso no agregaba
// nada y sí rompía cosas: el navegador pierde el manejo nativo de los
// pedidos por rango (los <video>), de las redirecciones y del caché de
// navegación hacia atrás, y cada pedido se paga dos veces. Para que la app
// sea instalable no hace falta ningún handler de fetch desde Chrome 89 — el
// de arriba existe para el caso concreto de "quiero que abra sin señal",
// no por requisito de instalación.

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
// Solo se abren rutas de NUESTRO propio origen. El destino viene dentro del
// payload del push; hoy ese payload lo arma nuestro servidor, pero si
// alguna vez se filtraran las claves VAPID, quien las tenga podría mandarle
// un push a nuestros usuarios con la URL que quiera y este handler la
// abriría sin preguntar — phishing perfecto, abierto desde la notificación
// de una app en la que confían. Normalizando contra self.location.origin,
// lo peor que puede pasar es que abra la home.
function safeInternalUrl(raw) {
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin !== self.location.origin) return '/';
    return url.pathname + url.search;
  } catch {
    return '/';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safeInternalUrl(event.notification.data?.url || '/');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
