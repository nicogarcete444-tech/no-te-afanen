import { PRECIOS_CLAROS_BASE, PRECIOS_CLAROS_HEADERS } from '@/lib/preciosClarosBase';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { isCarrefour, isChangomas, isCoto, isDia, isDisco, isJumbo } from '@/lib/chains';

// Punto de referencia para ubicar sucursales: Obelisco (CABA). El objetivo
// del historial no es "el precio en la sucursal exacta del usuario" (eso ya
// lo resuelve la búsqueda en vivo con geolocalización real) sino "cómo
// evolucionó el precio de este producto en general" — un punto fijo y
// estable en el tiempo es justamente lo que hace comparables los snapshots
// de un día con los del día siguiente.
const REFERENCE_LAT = -34.6037;
const REFERENCE_LNG = -58.3816;

// Mismas 6 cadenas para las que StoreLogo.tsx tiene logo propio: son las de
// mayor cobertura nacional en Precios Claros, así que dan la serie más
// completa y comparable día a día.
export const TRACKED_CHAINS: { test: (n: string) => boolean; label: string }[] = [
  { test: isCarrefour, label: 'Carrefour' },
  { test: isChangomas, label: 'Changomas' },
  { test: isDisco, label: 'Disco' },
  { test: isJumbo, label: 'Jumbo' },
  { test: isCoto, label: 'Coto' },
  // isDia matchea la PALABRA: el `includes('dia')` de antes agarraba también
  // a "Diarco" y guardaba sus precios como si fueran de Día.
  { test: isDia, label: 'Dia' },
];

export type ReferenceStore = { chainLabel: string; sucursalId: string };
export type ChainPrice = { chain: string; precio: number; precioLista?: number };

// Las sucursales de referencia casi no cambian: se guardan en memoria del
// proceso unas horas para no pedirlas en cada validación de EAN.
const STORES_TTL_MS = 6 * 60 * 60 * 1000;
let storesCache: { at: number; stores: ReferenceStore[] } | null = null;

export async function fetchReferenceStores(): Promise<ReferenceStore[]> {
  if (storesCache && Date.now() - storesCache.at < STORES_TTL_MS) return storesCache.stores;

  const url = `${PRECIOS_CLAROS_BASE}/sucursales?lat=${REFERENCE_LAT}&lng=${REFERENCE_LNG}&limit=200`;
  const res = await fetchWithTimeout(url, { headers: PRECIOS_CLAROS_HEADERS, cache: 'no-store' }, 10_000);
  if (!res.ok) throw new Error('sucursales HTTP ' + res.status);
  const data = await res.json();
  const list: any[] = data?.sucursales || (Array.isArray(data) ? data : []);

  const found: ReferenceStore[] = [];
  for (const chain of TRACKED_CHAINS) {
    const match = list.find((s) => s?.banderaDescripcion && chain.test(String(s.banderaDescripcion)));
    const id = match?.id;
    if (id) found.push({ chainLabel: chain.label, sucursalId: String(id) });
  }
  if (found.length) storesCache = { at: Date.now(), stores: found };
  return found;
}

function toNum(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) && n > 0 ? n : undefined;
}

export async function fetchPricesForProduct(ean: string, stores: ReferenceStore[]): Promise<ChainPrice[]> {
  const ids = stores.map((s) => s.sucursalId).join(',');
  const url =
    `${PRECIOS_CLAROS_BASE}/producto?id_producto=${encodeURIComponent(ean)}` +
    `&array_sucursales=${encodeURIComponent(ids)}&limit=${stores.length}`;
  const res = await fetchWithTimeout(url, { headers: PRECIOS_CLAROS_HEADERS, cache: 'no-store' }, 8_000);
  if (!res.ok) throw new Error('producto HTTP ' + res.status);
  const data = await res.json();

  const out: ChainPrice[] = [];
  for (const suc of data?.sucursales || []) {
    if (!suc || suc.message) continue;
    const composite = `${suc.comercioId}-${suc.banderaId}-${suc.id}`;
    const store = stores.find((s) => s.sucursalId === composite);
    if (!store) continue;

    const precioLista = toNum(suc.preciosProducto?.precioLista);
    const promo = [toNum(suc.preciosProducto?.promo1?.precio), toNum(suc.preciosProducto?.promo2?.precio)].filter(
      (n): n is number => typeof n === 'number'
    );
    // El más bajo entre promos y lista: una "promo" más cara que la lista
    // (pasa con promos por cantidad) no es el precio al que se compra.
    const candidatos = [...promo, ...(precioLista ? [precioLista] : [])];
    const precio = candidatos.length ? Math.min(...candidatos) : undefined;
    if (typeof precio !== 'number') continue;

    out.push({ chain: store.chainLabel, precio, precioLista });
  }
  return out;
}

// ¿Este EAN existe de verdad en Precios Claros? Se usa antes de agregar un
// producto a la cola de seguimiento: sin esto cualquiera podía llenar los
// cupos de tracked_products con códigos inventados (que pasan el regex).
// Ante un error de red devuelve false: mejor no seguir un producto hoy que
// dejar entrar basura.
export async function eanExistsInPreciosClaros(ean: string): Promise<boolean> {
  try {
    const stores = await fetchReferenceStores();
    if (!stores.length) return false;
    const prices = await fetchPricesForProduct(ean, stores);
    return prices.length > 0;
  } catch {
    return false;
  }
}
