import { createClient } from '@/lib/supabase/server';
import StoreApp from '@/components/StoreApp';
import { isAdminEmail } from '@/lib/adminAuth';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ya no exigimos sesión acá: si no hay usuario, StoreApp arranca en modo
  // invitado (carrito solo en este dispositivo) y muestra el cartel para
  // crear cuenta.
  return <StoreApp userId={user?.id ?? null} userEmail={user?.email ?? null} isAdmin={isAdminEmail(user?.email)} />;
}
