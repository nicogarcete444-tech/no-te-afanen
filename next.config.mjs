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
  // Content-Security-Policy: solo permite cargar recursos desde donde la app
  // realmente los necesita (nuestro propio dominio, Supabase y las bases de
  // Open * Facts para las fotos de producto).
  //
  // Las tipografías (Archivo e Inter) ya NO se piden a fonts.googleapis.com /
  // fonts.gstatic.com: app/layout.tsx las carga con next/font/google, que las
  // descarga en build time y las sirve como archivo estático propio. Eso saca
  // esa request bloqueante de la cadena crítica de renderizado y de paso deja
  // que font-src/style-src queden más angostos, ya sin dominios externos.
  //
  // Lo que sigue en pie: las fotos de Perfumería y Limpieza. lib/productImage.ts
  // consulta tres bases (openfoodfacts para alimentos, openbeautyfacts para
  // cosmética y openproductsfacts para el resto), así que connect-src e
  // img-src necesitan las tres o esos rubros se quedan sin imagen. Sumamos
  // mlstatic.com (el CDN de imágenes de MercadoLibre): es el fallback que
  // usa /api/imagenes cuando ninguna de esas tres bases tiene foto del
  // producto — bastante habitual en marcas argentinas que esas bases
  // globales no llegan a cubrir.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.openfoodfacts.org https://*.openbeautyfacts.org https://*.openproductsfacts.org https://*.mlstatic.com",
      "connect-src 'self' https://*.supabase.co https://world.openfoodfacts.org https://world.openbeautyfacts.org https://world.openproductsfacts.org",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
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
