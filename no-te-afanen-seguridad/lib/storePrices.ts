// Arma la comparación real por súper para la búsqueda en vivo:
// 1) ubica sucursales cercanas y se queda con una por cadena (banderaDescripcion),
// 2) para un producto puntual (por su EAN), pide su precio en esas sucursales.
//
// Los precios de Precios Claros cambian a lo largo del día (ofertas, cambios
// de lista, etc.), así que estos resultados tienen vencimiento.
//
// Antes este caché duraba UNA SEMANA, igual que el del servidor. Para una app
// cuyo único trabajo es decirte cuánto sale algo hoy, eso es demasiado: te
// mandaba al súper con el precio de la semana pasada. Ahora son 30 minutos en
// el navegador (y 6 horas en el server, ver app/api/producto/route.ts, que es
// más o menos cada cuánto Precios Claros actualiza).
const PRICE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export type NearbyStore = {
  chain: string; // ej: "Coto", "Carrefour", "Supermercados DIA"
  sucursalId: string; // id compuesto que Precios Claros ya devuelve armado ("comercioId-banderaId-sucursalId")
};

// 4 en vez de 8: la comparación (tanto la ficha de un producto puntual como
// el total del carrito) queda más legible con 4 súpers grandes que con 8
// mezclando cadenas chicas o regionales sin logo. Como CADENAS_PRIORITARIAS
// de abajo ya prioriza a las cadenas nacionales (Carrefour, Coto, Jumbo,
// Disco, Día, ChangoMas), estos 4 lugares terminan siendo, casi siempre,
// las cadenas grandes que sí hay cerca — y solo se completa con una cadena
// regional si en la zona no hay 4 nacionales.
const MAX_CHAINS = 4;

// Precios Claros no es solo para supermercados: por la Ley de Góndolas
// también reportan cadenas de electrodomésticos, ferreterías, estaciones de
// servicio, etc. En vez de exigir que "sucursalTipo" diga explícitamente
// "supermercado" (ese campo viene con valores poco predecibles y terminaba
// descartando supermercados reales tipo Carrefour o Coto), solo excluimos
// por nombre las cadenas que sabemos que no son de supermercado.
const CADENAS_NO_SUPER = [
  'fravega', 'musimundo', 'megatone', 'cetrogar', 'compumundo', 'naldo lombardi',
  'garbarino', 'easy', 'sodimac', 'axion', 'ypf', 'shell', 'puma energy', 'samsung',
];

// Cadenas nacionales grandes: si aparecen en algún lado de las sucursales
// cercanas, priorizamos incluirlas en la comparación aunque no sean las
// primeras por distancia. Antes se armaba la lista en el orden puro en que
// venían (más cerca primero) y se cortaba en 8: en zonas con muchos
// autoservicios chicos o cadenas regionales, esos 8 lugares se llenaban
// antes de llegar a un Carrefour o un Jumbo que estaba un poco más lejos
// pero seguía siendo una opción real para comparar.
const CADENAS_PRIORITARIAS = ['carrefour', 'coto', 'jumbo', 'disco', 'dia', 'día', 'changomas', 'chango mas'];

function prioridadDeCadena(chain: string): number {
  const nombre = chain.toLowerCase();
  return CADENAS_PRIORITARIAS.some((p) => nombre.includes(p)) ? 0 : 1;
}

function esCadenaDeSuper(chain: string): boolean {
  const nombre = chain.toLowerCase();
  return !CADENAS_NO_SUPER.some((mala) => nombre.includes(mala));
}

export async function fetchNearbyStores(lat: number, lng: number): Promise<NearbyStore[]> {
  // 500 en vez de 200: junta un radio más amplio de sucursales antes de
  // filtrar, para que cadenas grandes que no tienen una sucursal entre las
  // 200 más cercanas (pero sí más allá) todavía entren en la comparación.
  const res = await fetch(`/api/sucursales?lat=${lat}&lng=${lng}&limit=500`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const list: any[] = data?.sucursales || (Array.isArray(data) ? data : []);

  // Una sola pasada, quedándonos con la sucursal más cercana de cada
  // cadena (el orden que ya trae la API es por distancia).
  const seen = new Set<string>();
  const candidatas: NearbyStore[] = [];
  for (const s of list) {
    const chain = s?.banderaDescripcion;
    // Precios Claros ya devuelve acá el id COMPUESTO ("comercioId-banderaId-
    // sucursalId", ej. "15-1-454"). Pegarle comercioId-banderaId encima de
    // nuevo (como se hacía antes) genera algo tipo "15-1-15-1-454", que
    // nunca matchea con nada y rompe la comparación por cadena.
    const id = s?.id;
    if (!chain || !id || seen.has(chain)) continue;
    if (!esCadenaDeSuper(chain)) continue;
    seen.add(chain);
    candidatas.push({ chain, sucursalId: String(id) });
  }

  // Ordenamos por prioridad (cadenas nacionales primero) preservando, DENTRO
  // de cada grupo, el orden por distancia con el que ya venían. Así, si hay
  // lugar para 8 cadenas, las grandes se ganan su lugar primero y el resto
  // de los cupos se completa con las cadenas locales más cercanas.
  return candidatas
    .map((store, i) => ({ store, i }))
    .sort((a, b) => prioridadDeCadena(a.store.chain) - prioridadDeCadena(b.store.chain) || a.i - b.i)
    .slice(0, MAX_CHAINS)
    .map(({ store }) => store);
}

export type StorePriceDetail = {
  precio: number;
  precioLista?: number;
  discountPct?: number;
};

// Caché en memoria con vencimiento (TTL): cada valor guardado "expira" solo,
// así el precio se termina refrescando aunque el usuario no recargue la
// página. No usamos un Map simple porque eso lo dejaba pegado al primer
// precio que se trajo en toda la sesión.
class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const detailCache = new TtlCache<Record<string, StorePriceDetail> | null>();
const detailInFlight = new Map<string, Promise<Record<string, StorePriceDetail> | null>>();

// Igual que fetchStorePrices, pero se queda también con el precio de lista
// y el % de descuento cuando hay una promo activa más barata que la lista,
// para poder mostrar el precio tachado en la ficha del producto.
export async function fetchStorePriceDetails(
  ean: string,
  stores: NearbyStore[],
  { fresh = false }: { fresh?: boolean } = {}
): Promise<Record<string, StorePriceDetail> | null> {
  if (!ean || !stores.length) return null;

  const cacheKey = ean + '|' + stores.map((s) => s.sucursalId).join(',');
  // `fresh` saltea el caché del navegador: lo usa el refresco del carrito
  // justo antes de comparar, que es el momento en que el precio tiene que
  // ser el de ahora sí o sí.
  if (!fresh && detailCache.has(cacheKey)) return detailCache.get(cacheKey)!;
  if (detailInFlight.has(cacheKey)) return detailInFlight.get(cacheKey)!;

  const promise = (async () => {
    try {
      const ids = stores.map((s) => s.sucursalId).join(',');
      const res = await fetch(
        `/api/producto?id_producto=${encodeURIComponent(ean)}&array_sucursales=${encodeURIComponent(ids)}&limit=${stores.length}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const toNum = (v: unknown): number | undefined => {
        const n = typeof v === 'string' ? parseFloat(v) : (v as number);
        return typeof n === 'number' && !Number.isNaN(n) && n > 0 ? n : undefined;
      };

      const result: Record<string, StorePriceDetail> = {};
      for (const suc of data?.sucursales || []) {
        if (!suc || suc.message) continue;
        const composite = `${suc.comercioId}-${suc.banderaId}-${suc.id}`;
        const store = stores.find((s) => s.sucursalId === composite);
        if (!store) continue;

        const precioLista = toNum(suc.preciosProducto?.precioLista);
        const promoCandidatos = [
          toNum(suc.preciosProducto?.promo1?.precio),
          toNum(suc.preciosProducto?.promo2?.precio),
        ].filter((n): n is number => typeof n === 'number');
        const mejorPromo = promoCandidatos.length ? Math.min(...promoCandidatos) : undefined;

        const precio = mejorPromo ?? precioLista;
        if (typeof precio !== 'number') continue;

        const detail: StorePriceDetail = { precio };
        if (mejorPromo && precioLista && mejorPromo < precioLista) {
          detail.precioLista = precioLista;
          detail.discountPct = Math.round((1 - mejorPromo / precioLista) * 100);
        }

        if (!(store.chain in result) || precio < result[store.chain].precio) {
          result[store.chain] = detail;
        }
      }

      const final = Object.keys(result).length ? result : null;
      detailCache.set(cacheKey, final, PRICE_TTL_MS);
      return final;
    } catch {
      // Un error de red no se guarda como "definitivo": si lo cacheáramos
      // igual que un resultado válido, un fallo pasajero dejaría al
      // producto sin precio durante 5 minutos enteros. Mejor reintentar en
      // el próximo pedido.
      return null;
    } finally {
      detailInFlight.delete(cacheKey);
    }
  })();

  detailInFlight.set(cacheKey, promise);
  return promise;
}

const priceCache = new TtlCache<Record<string, number> | null>();
const priceInFlight = new Map<string, Promise<Record<string, number> | null>>();

export async function fetchStorePrices(
  ean: string,
  stores: NearbyStore[]
): Promise<Record<string, number> | null> {
  if (!ean || !stores.length) return null;

  const cacheKey = ean + '|' + stores.map((s) => s.sucursalId).join(',');
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey)!;
  if (priceInFlight.has(cacheKey)) return priceInFlight.get(cacheKey)!;

  const promise = (async () => {
    try {
      const ids = stores.map((s) => s.sucursalId).join(',');
      const res = await fetch(
        `/api/producto?id_producto=${encodeURIComponent(ean)}&array_sucursales=${encodeURIComponent(ids)}&limit=${stores.length}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const result: Record<string, number> = {};
      for (const suc of data?.sucursales || []) {
        if (!suc || suc.message) continue; // sucursal sin datos para este producto
        const composite = `${suc.comercioId}-${suc.banderaId}-${suc.id}`;
        const store = stores.find((s) => s.sucursalId === composite);
        if (!store) continue;

        // No alcanza con mirar solo promo1: a veces viene vacío ("", no
        // ausente) y como "" no es null/undefined, el "??" no caía a
        // precioLista y el precio se perdía directamente. Ahora juntamos
        // promo1, promo2 y precioLista, y nos quedamos con el más bajo de
        // los que sean números válidos.
        const candidatos = [
          suc.preciosProducto?.promo1?.precio,
          suc.preciosProducto?.promo2?.precio,
          suc.preciosProducto?.precioLista,
        ];
        const precio = candidatos.reduce<number | undefined>((min, c) => {
          const n = typeof c === 'string' ? parseFloat(c) : c;
          if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return min;
          return min === undefined ? n : Math.min(min, n);
        }, undefined);
        if (typeof precio === 'number' && precio > 0) {
          if (!(store.chain in result) || precio < result[store.chain]) {
            result[store.chain] = precio;
          }
        }
      }

      const final = Object.keys(result).length ? result : null;
      priceCache.set(cacheKey, final, PRICE_TTL_MS);
      return final;
    } catch {
      return null;
    } finally {
      priceInFlight.delete(cacheKey);
    }
  })();

  priceInFlight.set(cacheKey, promise);
  return promise;
}
