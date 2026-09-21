import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente "admin": usa la service_role key, que ignora Row Level Security
// por completo. NUNCA importar este archivo desde código que corra en el
// navegador. Cada ruta que lo usa se cuida sola de no quedar abierta:
// app/api/cron/snapshot-prices/route.ts exige el secreto del cron, y
// app/api/track-product/route.ts exige pasar su propio rate limit (esa
// tabla ya no tiene policy de insert/update para nadie — ver
// supabase/schema.sql — así que este cliente es la ÚNICA puerta de
// escritura que le queda).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
