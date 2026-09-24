import { createClient } from '@/lib/supabase/client';

export type PricePoint = { date: string; precio: number };

// Cuánto se recuerda, en esta pestaña, que un producto ya se trackeó / que
// ya se le pidió el historial. Reabrir la misma ficha varias veces en una
// sesión (volver atrás, comparar dos productos yendo y viniendo) antes
// repetía el upsert a tracked_products y el select a price_snapshots cada
// vez, aunque nada haya cambiado en ese lapso: eran pedidos a Supabase que
// no aportaban nada nuevo. 5 minutos alcanza para el vaivén típico de una
// sesión de compra sin retrasar el historial real (el precio del día no
// cambia en ese rato).
const RECENT_TTL_MS = 5 * 60 * 1000;
const recentlyTracked = new Map<string, number>();
const historyCache = new Map<string, { at: number; data: PricePoint[] }>();

function isRecent(map: Map<string, number>, key: string): boolean {
  const at = map.get(key);
  return typeof at === 'number' && Date.now() - at < RECENT_TTL_MS;
}

// Se llama cada vez que se abre la ficha de un producto. "Fire and forget":
// si falla (sin red, Supabase caído, etc.) no debe romper ni frenar la
// UI — en el peor caso, ese producto tarda un poco más en empezar a tener
// historial.
export function trackProduct(ean: string | null, nombre: string) {
  if (!ean || isRecent(recentlyTracked, ean)) return;
  recentlyTracked.set(ean, Date.now());
  fetch('/api/track-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ean, nombre }),
  }).catch(() => {
    // si falla, se reintenta la próxima vez que se abra (se saca del mapa
    // para no quedar "trackeado" sin haberlo logrado de verdad).
    recentlyTracked.delete(ean);
  });
}

// Trae el historial ya guardado para un producto y lo agrupa por día,
// quedándose con el precio más bajo encontrado ese día entre las cadenas
// seguidas (mismo criterio que "Mejor precio" en la ficha del producto).
// Devuelve como mucho un punto por día, del más viejo al más nuevo.
export async function getPriceHistory(ean: string | null, days = 45): Promise<PricePoint[]> {
  if (!ean) return [];

  const cacheKey = `${ean}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RECENT_TTL_MS) return cached.data;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('price_snapshots')
    .select('precio, captured_at')
    .eq('ean', ean)
    .gte('captured_at', since.toISOString())
    .order('captured_at', { ascending: true });

  if (error || !data) return cached?.data ?? [];

  const byDay = new Map<string, number>();
  for (const row of data as { precio: number; captured_at: string }[]) {
    const day = row.captured_at.slice(0, 10); // "YYYY-MM-DD"
    const current = byDay.get(day);
    if (current === undefined || row.precio < current) byDay.set(day, row.precio);
  }

  const points = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, precio]) => ({ date, precio }));

  historyCache.set(cacheKey, { at: Date.now(), data: points });
  return points;
}
