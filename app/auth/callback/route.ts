import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// A donde vuelve el link "Confirm email address" del mail de Supabase.
//
// El mail no manda directo al usuario logueado: primero pasa por el
// verificador de Supabase, que valida el token y redirige acá con un
// "code" en la URL (flujo PKCE, el que usa @supabase/ssr). Sin esta ruta,
// ese code se pierde en el camino y la persona termina en la home como
// invitado, con la sesión sin crear — tiene que ir a /login y entrar de
// nuevo a mano, que es justo lo que queremos evitar.
//
// Acá se cambia ese code por la sesión real (exchangeCodeForSession), que
// deja las cookies puestas, y recién ahí se redirige a donde corresponda.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // login/page.tsx puede mandar a dónde volver después (hoy siempre "/",
  // pero queda abierto por si en el futuro se confirma desde un link a un
  // producto puntual, etc.).
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code vencido, ya usado, o algo falló: mandamos al login con un aviso
  // en vez de dejar a la persona en una pantalla en blanco.
  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
