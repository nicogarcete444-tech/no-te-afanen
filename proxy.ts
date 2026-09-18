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
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Si ya está logueado y entra a /login, lo mandamos al catálogo en vez de
    // mostrarle el formulario de nuevo.
    const isLoginRoute = request.nextUrl.pathname.startsWith('/login');
    if (user && isLoginRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
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
    // robots.txt y sitemap.xml también quedan afuera: son archivos para
    // crawlers, que no tienen sesión. Si el middleware corriera ahí haría una
    // llamada a Supabase al vacío por cada pedido de un bot y podría
    // devolverlos con Set-Cookie, lo que le dice al CDN que la respuesta es
    // privada y arruina el caché de dos archivos que son iguales para todos.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
