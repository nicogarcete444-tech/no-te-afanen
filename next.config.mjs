// Cabeceras de seguridad aplicadas a TODAS las respuestas. No son "opcionales":
// mitigan clickjacking, sniffing de MIME, fuga de referrer, y limitan qué
// orígenes puede cargar la página (CSP). Ajustar CSP acá si en el futuro se
// agrega algún dominio nuevo de imágenes/scripts, si no las requests a ese
// dominio quedarán bloqueadas por el navegador.
const securityHeaders = [
  // Evita que la página se cargue dentro de un <iframe> ajeno (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  // El navegador no debe "adivinar" el tipo de un archivo distinto al declarado.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No mandar la URL completa como referrer a sitios de terceros.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Apaga el acceso a cámara/micrófono/ubicación por default salvo lo que la
  // propia app necesita (geolocalización, para las sucursales cercanas).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()' },
  // Fuerza HTTPS en el navegador por 2 años, incluidos subdominios.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Aislamiento del contexto de navegación. COOP corta la referencia
  // window.opener entre nuestra pestaña y cualquier otra que la haya
  // abierto (o que abramos), así que un sitio externo no puede tocar
  // nuestro window ni navegarnos a otro lado. CORP evita que otro origen
  // embeba nuestras respuestas como recurso.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Sin prefetch de DNS: no filtramos a los resolvers qué dominios aparecen
  // en la página antes de que el usuario haga nada.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // La CSP NO está acá: se arma por request en proxy.ts, porque lleva un
  // nonce distinto cada vez. Ver el comentario largo en ese archivo.
  //
  // Antes vivía en este archivo y su script-src tenía 'unsafe-inline', que
  // es lo mismo que no tener defensa contra XSS: cualquier <script>
  // inyectado en el HTML se ejecutaba igual. Si por algún motivo hay que
  // volver atrás, el valor viejo está en el historial de git — pero
  // conviene arreglar el nonce y no reponer 'unsafe-inline'.
];

// Cache-Control largo + immutable para los estáticos de /public que no
// cambian de nombre cuando cambia el contenido (logos, íconos, imágenes
// sueltas). Sin esto, Next los sirve con las cabeceras de caché por defecto
// del hosting, bastante más cortas, y el navegador los re-pide en cada
// visita en vez de reusar la copia local. Si algún día se reemplaza uno de
// estos archivos (ej. un logo nuevo), hay que cambiarle el nombre — si no,
// los clientes con la versión vieja cacheada no van a ver el cambio hasta
// que expire igual, así que "immutable" solo es seguro combinado con eso.
const staticAssetHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Oculta la cabecera "X-Powered-By: Next.js" (info innecesaria para
  // atacantes sobre el stack del servidor).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/logos/:path*',
        headers: staticAssetHeaders,
      },
      {
        source: '/icons/:path*',
        headers: staticAssetHeaders,
      },
      {
        source: '/images/:path*',
        headers: staticAssetHeaders,
      },
    ];
  },
};

export default nextConfig;
