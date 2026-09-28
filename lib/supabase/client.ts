import { createBrowserClient } from '@supabase/ssr';

// Cliente de Supabase para usar en componentes de cliente ('use client').
// Se crea una sola vez por sesión de navegador; createBrowserClient ya
// maneja el guardado de la sesión en cookies para que el server la vea.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
