import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente "admin": usa la service_role key, que ignora Row Level Security
// por completo. NUNCA importar este archivo desde código que corra en el
// navegador ni desde una ruta que no valide antes un secreto (ver
// app/api/cron/snapshot-prices/route.ts). Solo existe para que el cron
// pueda escribir en `price_snapshots` sin depender de una sesión de usuario.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
