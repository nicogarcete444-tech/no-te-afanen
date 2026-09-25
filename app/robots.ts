import type { MetadataRoute } from 'next';
import { SITE_URL, IS_PRODUCTION_DEPLOY } from '@/lib/siteUrl';

// Esto genera /robots.txt. No es un archivo estático en public/ a propósito:
// así la línea `Sitemap:` sale con el dominio real que esté sirviendo la app
// (o con "Disallow: /" entero si es un preview deploy) sin que haya que
// acordarse de editar un .txt a mano en cada cambio de dominio.
//
// Sin robots.txt el crawler no tiene ninguna directiva y entra a todo lo que
// encuentre linkeado: /login, /admin, y las rutas de /api/ que devuelven JSON
// crudo. Nada de eso tiene sentido en un buscador.
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_DEPLOY) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // JSON de la API: no es contenido para usuarios y cada rastreo es
          // una llamada más a Precios Claros y a Supabase.
          '/api/',
          // Panel interno. Igual está protegido por login + ADMIN_EMAILS,
          // pero no hay razón para que aparezca en resultados.
          '/admin',
          // Formulario de login/alta: no aporta nada indexado y evita que
          // Google lo muestre como puerta de entrada al sitio.
          '/login',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
