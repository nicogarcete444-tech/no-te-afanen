import { createClient } from '@/lib/supabase/client';

// Tope de alertas ("avisame si baja") simultáneas para cuentas free. No es
// por semana ni por mes como el carrito o las comparaciones: es cuántos
// productos distintos puede tener vigilados A LA VEZ. Sacar una alerta
// libera un lugar para agregar otra, igual que con el carrito.
export const FREE_ALERT_LIMIT = 5;

export type PriceDropNotification = {
  id: number;
  ean: string;
  nombre: string | null;
  oldPrice: number;
  newPrice: number;
  pctDrop: number;
  direction: 'bajo' | 'subio';
  createdAt: string;
  read: boolean;
};

// Alertas de bajada de precio: requieren cuenta (a diferencia del carrito y
// el ahorro, que también funcionan como invitado). No hay forma de avisarle
// a un dispositivo anónimo de forma confiable entre sesiones sin sumar push
// con VAPID keys, así que por ahora esto vive atado a la cuenta.

export async function isWatching(userId: string, ean: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from('price_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('ean', ean)
    .maybeSingle();
  return !!data;
}

// Trae de una sola vez todos los EAN que el usuario está siguiendo, para
// poder mostrar la campanita ya prendida en cada fila de una lista larga
// sin hacer un isWatching() por producto.
export async function getWatchedEans(userId: string): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase.from('price_alerts').select('ean').eq('user_id', userId);
  return new Set((data || []).map((r) => r.ean));
}

// Cuántas alertas distintas tiene activas hoy. Se usa para frenar a las
// cuentas free en FREE_ALERT_LIMIT antes de dejarlas prender una más
// (premium no llama a esto: no tiene tope).
export async function getWatchedCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('price_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

// Prende o apaga la alerta para este producto. Devuelve el nuevo estado
// (true = quedó vigilando) para que el botón se pueda actualizar sin volver
// a consultar. Si algo falla, devuelve el estado anterior sin tocar nada.
export async function toggleWatch(userId: string, ean: string, nombre: string, currentlyWatching: boolean): Promise<boolean> {
  const supabase = createClient();
  if (currentlyWatching) {
    const { error } = await supabase.from('price_alerts').delete().eq('user_id', userId).eq('ean', ean);
    return error ? true : false;
  }
  // price_alerts.ean es una foreign key a tracked_products (schema.sql), y
  // esa tabla solo se llena cuando alguien abre la FICHA del producto. Con la
  // campanita de las tarjetas se puede seguir un producto sin haberlo abierto
  // nunca: el insert reventaba por la foreign key, toggleWatch devolvía false
  // y la pantalla decía "Dejaste de seguir este precio" sin haber pasado
  // nada. Se registra el producto primero (y se ESPERA), después la alerta.
  try {
    await fetch('/api/track-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ean, nombre }),
    });
  } catch {
    // si falla, igual se intenta el insert: si el producto ya estaba
    // registrado (lo abrieron antes) anda igual.
  }
  const { error } = await supabase.from('price_alerts').upsert(
    { user_id: userId, ean, nombre },
    { onConflict: 'user_id,ean', ignoreDuplicates: true }
  );
  return error ? false : true;
}

// Solo el número de avisos sin leer, para la campanita del header. Antes el
// header traía las 20 filas completas (getNotifications) en CADA carga de
// página con sesión iniciada, solo para poder mostrar el puntito rojo con un
// conteo — la lista de verdad recién se necesita si la persona abre el
// panel. Un `head: true` con filtro cuenta en Postgres sin bajar ninguna
// fila (mucho más liviano que traer las 20 y sus 8 columnas cada vez).
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('price_drop_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

export async function getNotifications(userId: string, limit = 20): Promise<PriceDropNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('price_drop_notifications')
    .select('id, ean, nombre, old_price, new_price, pct_drop, direction, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    ean: r.ean,
    nombre: r.nombre,
    oldPrice: r.old_price,
    newPrice: r.new_price,
    pctDrop: r.pct_drop,
    direction: r.direction === 'subio' ? 'subio' : 'bajo',
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('price_drop_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}
