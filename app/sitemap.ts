import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteUrl';
import { LAST_UPDATED_ISO } from '@/components/LegalSection';

// Esto genera /sitemap.xml.
//
// Solo van las rutas públicas y estables. La app es una SPA: el catálogo, el
// detalle de producto y los resultados de búsqueda viven todos dentro de "/"
// con estado en el cliente, no son URLs propias, así que no hay nada más que
// listar. /login y /admin quedan afuera por lo mismo que están en el
// Disallow de robots.ts.
//
// `lastModified` de las páginas legales sale de la misma constante que muestra
// el pie de esas páginas, para que no se desincronicen: si actualizás los
// términos, el sitemap lo refleja solo.
export default function sitemap(): MetadataRoute.Sitemap {
  const legalLastModified = new Date(LAST_UPDATED_ISO);

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: legalLastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/terminos`,
      lastModified: legalLastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/privacidad`,
      lastModified: legalLastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
