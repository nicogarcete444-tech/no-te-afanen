// "Ofertas cerca tuyo": barre un puñado de productos ya traídos de Precios
// Claros y se fija, sucursal por sucursal (las mismas `stores` que ya usa la
// comparación por cadena, ver lib/storePrices.ts), cuáles tienen ahora mismo
// una promo activa (promo1/promo2 más barata que el precio de lista) en algún
// súper cercano. No inventamos descuentos: es el mismo dato de
// `fetchStorePriceDetails` que ya se muestra en la ficha de cada producto,
// solo que acá lo recorremos en tanda para armar un feed.
import { extractEan, LiveItem } from './liveItems';
import { fetchStorePriceDetails, NearbyStore } from './storePrices';

export type NearbyDeal = {
  id: string;
  ean: string;
  nombre: string;
  marca?: string;
  presentacion?: string;
  category?: string;
  chain: string;
  precio: number;
  precioLista: number;
  discountPct: number;
};

// Corre `worker` sobre `items` de a lo sumo `limit` en simultáneo, en vez de
// disparar todos los pedidos juntos (eso saturaría /api/producto y pisaría
// el rate limit del servidor para una sola carga de pantalla).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function findNearbyDeals(
  items: LiveItem[],
  stores: NearbyStore[],
  {
    max = 12,
    minDiscountPct = 8,
    scanLimit = 40,
    concurrency = 4,
  }: { max?: number; minDiscountPct?: number; scanLimit?: number; concurrency?: number } = {}
): Promise<NearbyDeal[]> {
  if (!stores.length || !items.length) return [];

  // Un producto puede aparecer repetido entre varias búsquedas del teaser
  // (mismo EAN, distinta categoría con la que se etiquetó): nos quedamos con
  // la primera aparición para no consultar dos veces la misma promo.
  const seen = new Set<string>();
  const candidates: { item: LiveItem; ean: string }[] = [];
  for (const item of items) {
    const ean = extractEan(item);
    if (!ean || seen.has(ean)) continue;
    seen.add(ean);
    candidates.push({ item, ean });
    if (candidates.length >= scanLimit) break;
  }

  const results = await mapWithConcurrency(candidates, concurrency, async ({ item, ean }) => {
    const details = await fetchStorePriceDetails(ean, stores);
    if (!details) return null;

    // De las cadenas cercanas que tienen este producto, la promo más
    // conveniente: mayor % de descuento y, si empatan, el precio final
    // más bajo.
    let best: { chain: string; precio: number; precioLista: number; discountPct: number } | null = null;
    for (const [chain, d] of Object.entries(details)) {
      if (!d.discountPct || !d.precioLista || d.discountPct < minDiscountPct) continue;
      if (
        !best ||
        d.discountPct > best.discountPct ||
        (d.discountPct === best.discountPct && d.precio < best.precio)
      ) {
        best = { chain, precio: d.precio, precioLista: d.precioLista, discountPct: d.discountPct };
      }
    }
    if (!best) return null;

    const deal: NearbyDeal = {
      id: 'deal:' + ean,
      ean,
      nombre: item.nombre?.trim() || item.presentacion?.trim() || item.marca || 'Producto',
      marca: item.marca,
      presentacion: item.presentacion,
      category: item._cat,
      chain: best.chain,
      precio: best.precio,
      precioLista: best.precioLista,
      discountPct: best.discountPct,
    };
    return deal;
  });

  return results
    .filter((d): d is NearbyDeal => !!d)
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, max);
}
