// URL canónica del sitio. La necesitan tres lugares que no pueden adivinarla
// solos porque corren en el server, sin `window.location`:
//
//   - app/sitemap.ts   → el protocolo de sitemaps exige URLs absolutas.
//   - app/robots.ts    → la línea `Sitemap:` también tiene que ser absoluta.
//   - app/layout.tsx   → `metadataBase`, para que og:image y los <link
//                        rel="canonical"> salgan absolutos y no relativos.
//
// Orden de prioridad:
//   1. NEXT_PUBLIC_SITE_URL, si la definís a mano. Es la que manda: cuando
//      enchufes un dominio propio (notoafanen.com.ar o lo que sea) poné esa y
//      listo, el resto del código no se toca.
//   2. VERCEL_PROJECT_PRODUCTION_URL, que Vercel inyecta sola y apunta siempre
//      al dominio de producción (no al de cada preview deploy). Evita el error
//      clásico de que el sitemap de un preview se indexe como si fuera el sitio
//      real.
//   3. localhost, para `next dev`.
//
// Se normaliza sin barra final para poder concatenar `${SITE_URL}/legal` sin
// terminar con dobles barras.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();

// `true` solo en el deploy de producción. Lo usa robots.ts para que los
// preview deploys de Vercel se sirvan con un "Disallow: /" completo: son
// copias enteras del sitio en una URL distinta y, si Google las encuentra,
// compiten con el sitio real por el mismo contenido.
export const IS_PRODUCTION_DEPLOY =
  process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === 'production';
