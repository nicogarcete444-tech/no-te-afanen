import { createClient } from '@/lib/supabase/server';
import StoreApp from '@/components/StoreApp';
import { isAdminEmail, isAdminUser } from '@/lib/adminAuth';

export default async function HomePage() {
  const supabase = await createClient();

  // getClaims() verifica el JWT localmente (con las claves asimétricas del
  // proyecto) y evita un viaje a Supabase Auth en cada carga de la home. Solo
  // si el email figura en ADMIN_EMAILS se hace la verificación completa con
  // getUser(), porque para dar acceso admin sí hay que confirmar contra Auth
  // que el email está verificado.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  const userEmail = typeof claims?.email === 'string' ? claims.email : null;

  let isAdmin = false;
  if (userId && isAdminEmail(userEmail)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAdmin = isAdminUser(user);
  }

  // Ya no exigimos sesión acá: si no hay usuario, StoreApp arranca en modo
  // invitado (carrito solo en este dispositivo) y muestra el cartel para
  // crear cuenta.
  return <StoreApp userId={userId} userEmail={userEmail} isAdmin={isAdmin} />;
}
