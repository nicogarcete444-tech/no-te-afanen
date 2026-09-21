import { createClient } from '@/lib/supabase/client';

export type PricePoint = { date: string; precio: number };

// Se llama cada vez que se abre la ficha de un producto. "Fire and forget":
// si falla (sin red, Supabase caído, etc.) no debe romper ni frenar la
// UI — en el peor caso, ese producto tarda un poco más en empezar a tener
// historial.
export function trackProduct(ean: string | null, nombre: string) {
  if (!ean) return;
  fetch('/api/track-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ean, nombre }),
  }).catch(() => {});
}

// Trae el historial ya guardado para un producto y lo agrupa por día,
// quedándose con el precio más bajo encontrado ese día entre las cadenas
// seguidas (mismo criterio que "Mejor precio" en la ficha del producto).
// Devuelve como mucho un punto por día, del más viejo al más nuevo.
export async function getPriceHistory(ean: string | null, days = 45): Promise<PricePoint[]> {
  if (!ean) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('price_snapshots')
    .select('precio, captured_at')
    .eq('ean', ean)
    .gte('captured_at', since.toISOString())
    .order('captured_at', { ascending: true });

  if (error || !data) return [];

  const byDay = new Map<string, number>();
  for (const row of data as { precio: number; captured_at: string }[]) {
    const day = row.captured_at.slice(0, 10); // "YYYY-MM-DD"
    const current = byDay.get(day);
    if (current === undefined || row.precio < current) byDay.set(day, row.precio);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, precio]) => ({ date, precio }));
}
