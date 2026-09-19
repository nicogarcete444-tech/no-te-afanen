import { NearbyStore, fetchStorePriceDetails } from '@/lib/storePrices';
import { CartMap, Product } from '@/lib/types';

// Cuánto vale un precio guardado antes de considerarlo viejo.
//
// Los precios de supermercado en Argentina se mueven seguido, así que un
// número traído hace una semana no sirve para decidir a qué súper ir. Antes
// pasaba justo eso: el precio quedaba congelado en el momento en que
// agregabas el producto al carrito y no se refrescaba nunca más.
export const PRICE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 horas

export function isStale(product: Product): boolean {
  if (!product.pricedAt) return true;
  return Date.now() - product.pricedAt > PRICE_MAX_AGE_MS;
}

// El precio más viejo de todo el carrito (Date.now() en ms), o null si el
// carrito está vacío o ningún producto tiene fecha.
export function oldestPricedAt(
  selected: CartMap,
  products: Record<string, Product>
): number | null {
  const times = Object.keys(selected)
    .filter((id) => selected[id] > 0)
    .map((id) => products[id]?.pricedAt)
    .filter((t): t is number => typeof t === 'number');
  return times.length ? Math.min(...times) : null;
}

export function formatAge(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 2) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

// Vuelve a pedirle a Precios Claros el precio actual de cada producto del
// carrito en los súpers que hoy están cerca de la persona, y devuelve los
// productos actualizados.
//
// Esto es lo que hace que la comparación sea de precios de ahora y no de los
// del día en que armaste el carrito. Se llama justo antes de mostrar el
// desglose, que es el momento en el que el número importa de verdad.
//
// Solo se refrescan los productos con código de barras (sin EAN no hay forma
// de volver a preguntar) y los que ya están vencidos, para no repetir
// consultas al pedo si acabás de comparar.
export async function refreshCartPrices(
  selected: CartMap,
  products: Record<string, Product>,
  stores: NearbyStore[],
  { force = false }: { force?: boolean } = {}
): Promise<{ updated: Record<string, Product>; changed: boolean }> {
  if (!stores.length) return { updated: products, changed: false };

  const targets = Object.keys(selected)
    .filter((id) => selected[id] > 0)
    .map((id) => ({ id, product: products[id] }))
    .filter(({ product }) => !!product?.ean && (force || isStale(product)));

  if (!targets.length) return { updated: products, changed: false };

  const results = await Promise.all(
    targets.map(async ({ id, product }) => {
      const detail = await fetchStorePriceDetails(product.ean!, stores, { fresh: true });
      if (!detail) return null;
      const prices: Record<string, number> = {};
      Object.entries(detail).forEach(([chain, d]) => {
        prices[chain] = d.precio;
      });
      // Si la consulta no trajo ni un precio, nos quedamos con lo que había:
      // mejor un dato viejo marcado como viejo que ningún dato.
      if (!Object.keys(prices).length) return null;
      return { id, product: { ...product, prices, pricedAt: Date.now() } };
    })
  );

  const updated = { ...products };
  let changed = false;
  results.forEach((r) => {
    if (!r) return;
    updated[r.id] = r.product;
    changed = true;
  });

  return { updated, changed };
}
