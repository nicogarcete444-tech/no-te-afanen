// Foto real de un producto a partir de su código de barras (EAN).
//
// Todo el trabajo pesado lo hace /api/imagenes, del lado del servidor (ver el
// comentario largo ahí sobre por qué antes las fotos no aparecían). Acá solo
// queda la parte del navegador, y lo importante es esto: los pedidos se
// AGRUPAN.
//
// Cada tarjeta de producto llama a getProductImageUrls() por su cuenta al
// montarse. Si cada llamada disparara su propio fetch, volveríamos al
// problema original (cientos de pedidos en paralelo). En vez de eso, las
// llamadas que ocurren dentro de la misma ventana de unos milisegundos se
// juntan en un solo pedido con todos los códigos.
//
// El server devuelve, por cada EAN, un ARRAY de URLs ordenadas por prioridad
// (no una sola): normalmente es una, pero cuando el nivel que encontró la
// foto tenía más de una fuente con resultado, vienen todas. Sirve de
// respaldo: si la primera imagen rompe en el navegador (link caído,
// hotlinking bloqueado por la tienda) se prueba la siguiente de la MISMA
// respuesta, sin pedirle nada de nuevo al server ni pisarse con otra tarjeta
// que esté resolviendo su propio EAN en paralelo (cada una tiene su propio
// array e índice, ver useProductPhoto más abajo).

const CHUNK_DELAY_MS = 40;
const MAX_PER_REQUEST = 60;

const cache = new Map<string, string[]>();
const pending = new Map<string, { resolve: (v: string[]) => void }[]>();
// Nombre "de mejor esfuerzo" para cada EAN en cola: el server lo usa SOLO
// como respaldo, para validar una foto de MercadoLibre cuando ninguna de
// las bases abiertas ni las tiendas tienen nada (ver /api/imagenes). Si dos tarjetas
// piden el mismo EAN con nombres distintos, se queda el primero — no afecta
// la validación de forma relevante.
const pendingNames = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function isValidEan(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

// El id de un producto agregado desde la búsqueda en vivo tiene la forma
// "live:<ean>" (lo arma cartIdFor en lib/liveItems.ts). Si ya tenemos ese EAN
// a mano, conviene usarlo directo en vez de volver a adivinar el producto a
// partir del nombre.
export function eanFromCartId(id: string): string | null {
  if (!id.startsWith('live:')) return null;
  const candidate = id.slice('live:'.length);
  return isValidEan(candidate) ? candidate : null;
}

async function flush() {
  flushTimer = null;
  const eans = Array.from(pending.keys()).slice(0, MAX_PER_REQUEST);
  if (!eans.length) return;

  // Sacamos de la cola lo que se va en este pedido; lo que quede (más de 60)
  // se manda en la tanda siguiente.
  const waiters = new Map<string, { resolve: (v: string[]) => void }[]>();
  eans.forEach((ean) => {
    waiters.set(ean, pending.get(ean)!);
    pending.delete(ean);
  });
  if (pending.size && !flushTimer) flushTimer = setTimeout(flush, CHUNK_DELAY_MS);

  // names viaja en el mismo orden que eans; cada nombre va con su propio
  // encodeURIComponent para que una coma adentro del nombre no rompa el
  // separador con el que el server lo vuelve a partir.
  const names = eans
    .map((ean) => encodeURIComponent(pendingNames.get(ean) ?? ''))
    .join(',');
  eans.forEach((ean) => pendingNames.delete(ean));

  let imagenes: Record<string, string[]> = {};
  // EAN para los que alguna fuente falló y no se pudo confirmar "sin foto":
  // no se cachean en la sesión, así se reintentan la próxima vez.
  let pendientes = new Set<string>();
  try {
    const res = await fetch(`/api/imagenes?eans=${eans.join(',')}&names=${names}`);
    if (res.ok) {
      const data = await res.json();
      imagenes = data?.imagenes || {};
      pendientes = new Set<string>(Array.isArray(data?.pendientes) ? data.pendientes : []);
    }
  } catch {
    // Sin red o error del server: resolvemos todo como "sin foto" y que se
    // muestre el respaldo. No cacheamos el fallo, así un problema pasajero
    // no deja al producto sin imagen para toda la sesión.
  }

  waiters.forEach((list, ean) => {
    const raw = imagenes[ean];
    const urls = Array.isArray(raw) ? raw : [];
    // Solo cacheamos si el server llegó a contestar algo sobre este código.
    if (Object.prototype.hasOwnProperty.call(imagenes, ean) && !pendientes.has(ean)) cache.set(ean, urls);
    list.forEach((w) => w.resolve(urls));
  });
}

// name es opcional y solo se usa como respaldo del lado del server (ver
// comentario de pendingNames arriba); si no se pasa, el producto igual se
// resuelve normal contra las 3 bases, simplemente no hay fallback de
// MercadoLibre para él.
//
// Devuelve TODAS las URLs candidatas para ese EAN, ordenadas por prioridad
// (array vacío = confirmado sin foto). Para el caso común de "quiero una
// sola URL para mostrar" está getProductImageUrl más abajo; para el caso de
// una <img> con onError que tiene que probar la siguiente si la primera
// rompe, usar directamente esta función (o el hook useProductPhoto).
export async function getProductImageUrls(
  ean: string | undefined | null,
  name?: string | null
): Promise<string[]> {
  if (!ean || !isValidEan(ean)) return [];
  if (cache.has(ean)) return cache.get(ean)!;

  return new Promise<string[]>((resolve) => {
    if (name && !pendingNames.has(ean)) pendingNames.set(ean, name);
    const list = pending.get(ean);
    if (list) {
      list.push({ resolve });
    } else {
      pending.set(ean, [{ resolve }]);
    }
    if (!flushTimer) flushTimer = setTimeout(flush, CHUNK_DELAY_MS);
  });
}

// Wrapper de compatibilidad: solo la primera URL (o null). Para componentes
// que no necesitan reintentar con una fuente alternativa si la imagen rompe.
export async function getProductImageUrl(
  ean: string | undefined | null,
  name?: string | null
): Promise<string | null> {
  const urls = await getProductImageUrls(ean, name);
  return urls[0] ?? null;
}

// --- Buscar el EAN a partir del nombre -------------------------------------
// Algunos productos del carrito viejo se guardaron sin EAN en el id. Para
// esos, le preguntamos a nuestro proxy de Precios Claros por el nombre y
// usamos el id del primer resultado.
// /api/productos exige lat/lng (desde que se endureció la validación) y este
// pedido no mandaba ninguno: siempre daba 400 y los productos del carrito
// viejo sin EAN se quedaban sin foto. Punto fijo en Buenos Aires: acá solo
// se usa para ubicar el producto por nombre, no para precios.
const BA_LAT = -34.6037;
const BA_LNG = -58.3816;
const nameToEanCache = new Map<string, string | null>();
const nameInFlight = new Map<string, Promise<string | null>>();

async function getEanByName(name: string): Promise<string | null> {
  if (nameToEanCache.has(name)) return nameToEanCache.get(name)!;
  if (nameInFlight.has(name)) return nameInFlight.get(name)!;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/productos?q=${encodeURIComponent(name)}&lat=${BA_LAT}&lng=${BA_LNG}&limit=1&smart=1`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const first = (data?.productos || [])[0];
      const raw = first?.id ?? first?.id_producto ?? first?.codigo_barras ?? first?.ean;
      const ean = raw !== undefined && raw !== null ? String(raw) : null;
      nameToEanCache.set(name, ean);
      return ean;
    } catch {
      nameToEanCache.set(name, null);
      return null;
    } finally {
      nameInFlight.delete(name);
    }
  })();

  nameInFlight.set(name, promise);
  return promise;
}

// El nombre que usamos para buscarle foto a un producto (mismo criterio que
// usa cada tarjeta): nombre, si no hay presentación, si no hay marca. Vive
// acá para que la portada (pickHomeTeaserWithPhotos, en StoreApp) elija
// entre varios candidatos con el mismo criterio que después va a mostrar.
export function photoLookupName(item: { nombre?: string; presentacion?: string; marca?: string }): string {
  return item.nombre?.trim() || item.presentacion?.trim() || item.marca || 'Producto';
}

export async function getProductImageUrlByName(name: string): Promise<string | null> {
  const ean = await getEanByName(name);
  return getProductImageUrl(ean, name);
}

export async function getProductImageUrlsByName(name: string): Promise<string[]> {
  const ean = await getEanByName(name);
  return getProductImageUrls(ean, name);
}

// --- Hook: foto con fallback automático entre fuentes -----------------------
// Cada componente que muestra una foto (tarjeta, ficha, carrito, feed de
// ofertas) repetía el mismo patrón: pedir la URL, guardarla en estado, y si
// el <img> tira onError, volver al monograma. Este hook centraliza eso Y
// agrega el paso que faltaba: antes de rendirse al monograma, prueba la
// URL SIGUIENTE del array que ya trajo getProductImageUrls (sin pedir nada
// de nuevo al server). Cada instancia del hook tiene su propio índice, así
// que dos tarjetas resolviendo EANs distintos en paralelo nunca se pisan
// entre sí.
import { useEffect, useRef, useState } from 'react';

export function useProductPhoto(ean: string | null | undefined, name: string) {
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(!!ean);
  // Evita que una respuesta que llega tarde (EAN/nombre viejo, tarjeta
  // reciclada por una lista virtualizada) pise el estado de la petición
  // actual.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setIndex(0);
    if (!ean) {
      setUrls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getProductImageUrls(ean, name).then((found) => {
      if (requestId.current !== id) return;
      setUrls(found);
      setLoading(false);
    });
  }, [ean, name]);

  return {
    url: urls[index] ?? null,
    loading,
    // Se llama desde el onError de la <img>: pasa a la próxima fuente si
    // queda alguna; si no queda ninguna, url vuelve null y el componente
    // muestra su respaldo (monograma).
    onImageError: () => setIndex((i) => i + 1),
  };
}

// Misma idea que useProductPhoto, pero para productos del carrito: el id
// puede traer el EAN directo ("live:<ean>") o no, y en ese caso hay que
// resolverlo por nombre (ver getEanByName más arriba). Se usa en
// CartSheet.tsx.
export function useCartItemPhoto(id: string, name: string) {
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const reqId = ++requestId.current;
    setIndex(0);
    const ean = eanFromCartId(id);
    const lookup = ean ? getProductImageUrls(ean, name) : getProductImageUrlsByName(name);
    lookup.then((found) => {
      if (requestId.current !== reqId) return;
      setUrls(found);
    });
  }, [id, name]);

  return {
    url: urls[index] ?? null,
    onImageError: () => setIndex((i) => i + 1),
  };
}

// --- Escaneo de código de barras -------------------------------------------
// Resuelve el NOMBRE de un producto a partir de su EAN. Esto es lo que hace
// posible el escáner: Precios Claros no acepta buscar por código de barras
// (solo por nombre), así que primero traducimos "código -> nombre" y recién
// después buscamos ese nombre. Va por nuestro server por los mismos motivos
// que las fotos.
const nameByEanCache = new Map<string, string | null>();
const nameByEanInFlight = new Map<string, Promise<string | null>>();

export async function getProductNameByEan(ean: string | undefined | null): Promise<string | null> {
  if (!ean || !isValidEan(ean)) return null;
  if (nameByEanCache.has(ean)) return nameByEanCache.get(ean)!;
  if (nameByEanInFlight.has(ean)) return nameByEanInFlight.get(ean)!;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/nombre-producto?ean=${encodeURIComponent(ean)}`);
      if (!res.ok) {
        nameByEanCache.set(ean, null);
        return null;
      }
      const data = await res.json();
      const nombre: string | null = data?.nombre ?? null;
      nameByEanCache.set(ean, nombre);
      return nombre;
    } catch {
      return null;
    } finally {
      nameByEanInFlight.delete(ean);
    }
  })();

  nameByEanInFlight.set(ean, promise);
  return promise;
}

// Precios Claros busca el término como si fuera una frase (necesita
// encontrarla más o menos completa dentro del nombre real del producto).
// Open Food Facts a veces devuelve "Marca + Nombre" con una palabra de más
// (sabor, variedad, presentación) que Precios Claros no tiene cargada igual,
// y entonces la búsqueda completa no encuentra nada aunque el producto SÍ
// esté (por ejemplo "Manaos Cola" no matchea, pero "Manaos" solo sí).
// Para no depender de que el usuario tenga que borrar esa palabra a mano,
// probamos primero la frase completa y, si no hay resultados, la vamos
// acortando de a una palabra desde el final hasta encontrar algo.
export async function resolveSearchableName(name: string, lat: number, lng: number): Promise<string> {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return name;

  for (let end = words.length; end >= 1; end--) {
    const candidate = words.slice(0, end).join(' ');
    try {
      const res = await fetch(
        `/api/productos?q=${encodeURIComponent(candidate)}&lat=${lat}&lng=${lng}&limit=1`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if ((data?.productos || []).length > 0) return candidate;
    } catch {
      // seguimos probando con la versión más corta
    }
  }
  // ningún recorte encontró nada: devolvemos el nombre completo tal cual,
  // para que se siga mostrando el mensaje normal de "sin resultados".
  return name;
}
