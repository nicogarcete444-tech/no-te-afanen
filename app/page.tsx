import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import StoreApp from '@/components/StoreApp';
import { isAdminEmail } from '@/lib/adminAuth';

// Texto que se entrega ya escrito en el HTML del servidor (no depende de JS ni
// de /api/). Sin esto, el catálogo carga solo desde /api/productos, que
// robots.txt le prohíbe a Google: el bot veía la home vacía y la descartaba
// como "Soft 404" en Search Console.
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ya no exigimos sesión acá: si no hay usuario, StoreApp arranca en modo
  // invitado (carrito solo en este dispositivo) y muestra el cartel para
  // crear cuenta.
  return (
    <>
      <h1 style={visuallyHidden}>No Te Afanen: comparador de precios de supermercados en Argentina</h1>
      <StoreApp userId={user?.id ?? null} userEmail={user?.email ?? null} isAdmin={isAdminEmail(user?.email)} />
      <section
        aria-label="Sobre No Te Afanen"
        className="wrap"
        style={{ paddingTop: 8, paddingBottom: 32, fontSize: 13, color: 'var(--ink-soft)' }}
      >
        <p>
          No Te Afanen compara los precios de tu changuito entre supermercados de Argentina, como Carrefour, Coto,
          Jumbo, Disco, Día y ChangoMás, para que veas dónde te conviene comprar cada producto según tu zona.
          Buscá un producto, armá tu carrito y mirá cuánto ahorrás en cada cadena.
        </p>
        <p style={{ marginTop: 8 }}>
          <Link href="/legal/terminos">Términos</Link> · <Link href="/legal/privacidad">Privacidad</Link> ·{' '}
          <Link href="/legal">Legales</Link>
        </p>
      </section>
    </>
  );
}
