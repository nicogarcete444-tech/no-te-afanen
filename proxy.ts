import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Corre en cada request. La app ahora se puede navegar sin cuenta (invitado):
// el catálogo, la búsqueda y el carrito funcionan igual. Esto solo se encarga
// de refrescar el token de sesión de Supabase si el usuario SÍ está logueado,
// para que no se desloguee solo. Ya no bloquea rutas.
//
// Antes este archivo se llamaba middleware.ts. Next 16 deprecó ese nombre
// (el build avisaba "The middleware file convention is deprecated") y ahora
// la convención es proxy.ts exportando `proxy`. Es el mismo comportamiento,
// solo cambia el nombre — pero si se dejaba como estaba, iba a dejar de
// funcionar en la próxima major y la sesión se caía sola.
//
// Importante: un error acá (falta una env var, Supabase está caído, etc.)
// NO puede tirar abajo la web entera — antes pasaba justo eso (500
// MIDDLEWARE_INVOCATION_FAILED en todas las páginas). Por eso todo el
// chequeo de sesión va en un try/catch y, ante cualquier problema, dejamos
// pasar la request como invitado en vez de romper todo.
// ---------------------------------------------------------------------
// Content-Security-Policy con nonce por request
// ---------------------------------------------------------------------
//
// Antes la CSP vivía entera en next.config.mjs y su script-src incluía
// 'unsafe-inline'. Eso deja la CSP casi sin efecto contra XSS, que es
// justamente el ataque del que la CSP tiene que defender: con
// 'unsafe-inline', CUALQUIER <script>...</script> que un atacante logre
// inyectar en el HTML se ejecuta igual. La CSP seguía sirviendo para
// limitar de dónde se cargan imágenes y a qué dominios se puede conectar,
// pero la parte que importa estaba abierta.
//
// Se puso ahí por un motivo real: Next inyecta scripts inline propios (los
// datos de hidratación) y la app tiene el script de arranque del tema. La
// forma correcta de permitir ESOS y solo esos es un nonce: un número al
// azar distinto en cada request, que se le pone a los scripts legítimos y
// que el atacante no puede adivinar. Por eso la CSP se arma acá y no en
// next.config: necesita generarse por request.
//
// Next lo propaga solo a sus propios scripts si encuentra el nonce en la
// cabecera CSP de la REQUEST (de ahí que se setee en los dos lados), y
// app/layout.tsx lo lee de x-nonce para el script del tema.
//
// A propósito NO se usa 'strict-dynamic': con strict-dynamic el navegador
// ignora la lista de dominios y confía en lo que carguen los scripts ya
// confiados. Manteniendo la lista explícita, el nonce saca 'unsafe-inline'
// sin tocar nada de lo que ya funcionaba.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    "worker-src 'self' blob:",
    // style-src sí conserva 'unsafe-inline': React escribe estilos inline
    // (style={{...}}) por todos lados y Next inyecta su CSS crítico igual.
    // El riesgo de un estilo inyectado es muchísimo menor que el de un
    // script: no ejecuta código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.openfoodfacts.org https://*.openbeautyfacts.org https://*.openproductsfacts.org https://*.openpetfoodfacts.org https://*.vtexassets.com https://*.vteximg.com.br https://*.mlstatic.com",
    "connect-src 'self' https://*.supabase.co https://world.openfoodfacts.org https://world.openbeautyfacts.org https://world.openproductsfacts.org",
    "font-src 'self' data:",
    "frame-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Si algún recurso se colara por http://, que el navegador lo pida por
    // https en vez de mostrar "contenido mixto" o cargarlo en claro.
    'upgrade-insecure-requests',
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  // crypto.randomUUID() usa el generador criptográfico del runtime, no
  // Math.random(): un nonce adivinable no sirve de nada.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Al rearmar la respuesta para escribir las cookies se perdían las
          // cabeceras ya puestas: hay que volver a pasar los headers de la
          // request (con el nonce) y a setear la CSP, si no las páginas que
          // refrescan sesión salían sin CSP y sus scripts sin nonce.
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set('Content-Security-Policy', csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // getClaims() valida el JWT localmente (sin viaje a Supabase Auth) y
    // refresca la sesión si el token venció. getUser() era un round-trip de
    // red en cada navegación.
    const { data: claimsData } = await supabase.auth.getClaims();
    const user = claimsData?.claims ?? null;

    // Si ya está logueado y entra a /login, lo mandamos al catálogo en vez de
    // mostrarle el formulario de nuevo.
    const isLoginRoute = request.nextUrl.pathname.startsWith('/login');
    if (user && isLoginRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      const redirect = NextResponse.redirect(url);
      redirect.headers.set('Content-Security-Policy', csp);
      return redirect;
    }
  } catch {
    // Cualquier falla de Supabase acá se ignora: el usuario sigue navegando
    // como invitado en vez de ver la web caída entera.
  }

  return response;
}

export const config = {
  matcher: [
    // corre en todo menos assets estáticos, archivos de Next y los archivos de
    // la PWA.
    //
    // /api/ también queda afuera: esas rutas no renderizan HTML (no
    // necesitan CSP con nonce) y las que necesitan sesión (push, cuenta,
    // admin) validan al usuario ellas mismas. Antes cada llamada a la API
    // pagaba una verificación de sesión extra, y una sola carga de la
    // vidriera dispara decenas de /api/productos.
    //
    // robots.txt y sitemap.xml también quedan afuera: son archivos para
    // crawlers, que no tienen sesión. Si el middleware corriera ahí haría una
    // llamada a Supabase al vacío por cada pedido de un bot y podría
    // devolverlos con Set-Cookie, lo que le dice al CDN que la respuesta es
    // privada y arruina el caché de dos archivos que son iguales para todos.
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
