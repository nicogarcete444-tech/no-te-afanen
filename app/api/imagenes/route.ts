import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, RATE_LIMITS } from '@/lib/apiSecurity';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

// Con hasta MAX_EANS productos por pedido y (antes) hasta 4 llamadas
// secuenciales por producto, esta ruta podía tardar bastante; le damos
// margen para el escenario con más productos y timeouts en juego.
export const maxDuration = 25;

// Resuelve, EN LOTE y del lado del servidor, la foto de varios productos a
// partir de su código de barras.
//
// Por qué existe esta ruta (o sea: por qué antes no aparecían las fotos):
//
// 1. Se hacía una consulta por producto DESDE EL NAVEGADOR. Con ~96 productos
//    en pantalla y hasta 3 bases distintas por producto, eso son casi 300
//    pedidos. El navegador solo abre ~6 conexiones a la vez contra el mismo
//    dominio, así que las fotos entraban de a gotas y las de más abajo no
//    llegaban nunca. Ahora el navegador hace UN pedido con todos los códigos.
//
// 2. Open Food Facts pide que los pedidos se identifiquen con un User-Agent
//    propio y limita los anónimos. Desde el navegador no se puede fijar ese
//    header; desde el server sí.
//
// 3. Los bloqueadores de publicidad y las políticas restrictivas de terceros
//    de algunos navegadores cortan pedidos a dominios externos que no
//    reconocen. Pidiéndolo a nuestro propio dominio, eso deja de pasar.
//
// CADENA DE FUENTES (cada producto pasa por los niveles EN ORDEN y se frena
// en el primero que tenga foto; las fuentes de un nivel siguiente NO se
// consultan para un producto que ya tiene foto, así no se pisan entre sí):
//
//   Nivel 1 — bases abiertas Open * Facts, las 4 en paralelo (cada una cubre
//             un rubro): alimentos, cosmética, mascotas y productos generales.
//   Nivel 2 — tiendas de supermercado (VTEX), por código de barras EXACTO:
//             primero las 4 grandes; si ninguna lo tiene, recién ahí el
//             segundo grupo (Vea, Changomás, Farmacity, Hiperlibertad).
//   Nivel 3 — MercadoLibre, por texto, validando que el título se parezca.
//
// Además se distingue "esa fuente NO tiene el producto" de "esa fuente falló
// (timeout, 429, 5xx)". Antes las dos cosas eran null, y un fallo pasajero
// quedaba cacheado como "sin foto" durante un mes. Ahora un fallo se avisa en
// `pendientes` y no se cachea por mucho tiempo.

const OFF_DOMAINS = [
  'world.openfoodfacts.org',      // alimentos y bebidas
  'world.openbeautyfacts.org',    // perfumería / cosmética
  'world.openpetfoodfacts.org',   // alimento para mascotas
  'world.openproductsfacts.org',  // limpieza y productos generales
];

// Tiendas VTEX de supermercados argentinos. VTEX permite buscar por código
// de barras exacto (alternateIds_Ean), así que si hay resultado ES el mismo
// producto. Se prueban todas en paralelo y, si más de una tiene foto, gana la
// que está primero en esta lista.
const VTEX_STORES = [
  'www.jumbo.com.ar',
  'www.carrefour.com.ar',
  'www.disco.com.ar',
  'diaonline.supermercadosdia.com.ar',
];

// Segundo grupo de tiendas VTEX: solo se consulta para los productos que el
// primer grupo tampoco tenía, así no se multiplican los pedidos (60
// productos x 8 tiendas a la vez harían que las tiendas rechacen con 429).
// Cubren lo que las 4 grandes a veces no tienen: Vea (mismo grupo que Jumbo
// pero otro catálogo), Changomás, farmacia/perfumería y Hiperlibertad.
const VTEX_STORES_2 = [
  'www.vea.com.ar',
  'www.masonline.com.ar',
  'www.farmacity.com',
  'www.hiperlibertad.com.ar',
];

const MAX_EANS = 60;
const CACHE_SECONDS = 60 * 60 * 24 * 30; // foto encontrada: un mes
const MISS_CACHE_SECONDS = 60 * 60 * 24; // "ninguna fuente la tiene": un día
const PENDING_CACHE_SECONDS = 60; // alguna fuente falló: que se reintente pronto
// Caché interna de cada fuente. Corto a propósito: si una base todavía no
// tenía el producto y alguien lo carga mañana, no queremos ignorarlo un mes.
const PROVIDER_REVALIDATE = 60 * 60 * 24 * 3;
// Tiempo máximo total del pedido (la función corta a los 25s).
const TOTAL_BUDGET_MS = 20_000;
const PER_CALL_TIMEOUT_MS = 4_000;
const MAX_CONCURRENT_CALLS = 40;

// Open Food Facts pide identificarse. Sin esto, los pedidos anónimos entran
// en la cola lenta o directamente se rechazan.
const OFF_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios; https://github.com/no-te-afanen)',
  Accept: 'application/json',
};

// MercadoLibre y las tiendas también piden un User-Agent propio.
const ML_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios)',
  Accept: 'application/json',
};

function isValidEan(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

// Resultado de consultar UNA fuente para UN producto.
type Probe = { status: 'hit'; url: string } | { status: 'miss' } | { status: 'error' };
const MISS: Probe = { status: 'miss' };
const ERROR: Probe = { status: 'error' };

// Límite de pedidos salientes simultáneos: 60 productos x 4-9 fuentes serían
// cientos de pedidos a la vez y las fuentes empiezan a rechazar (429).
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

// Cuánto tiempo le queda a este pedido para una llamada más (0 = ya no).
function budget(deadline: number): number {
  const left = deadline - Date.now();
  return left < 400 ? 0 : Math.min(PER_CALL_TIMEOUT_MS, left);
}

// Estados que significan "esta fuente no pudo contestar" (no "no lo tiene").
function isTransient(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

function normalizeEan(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

// --- Nivel 3: MercadoLibre ---------------------------------------------
//
// Las bases de Open * Facts son crowdsourced: si nadie fotografió ESE
// producto puntual, no hay foto. MercadoLibre cubre muchísimo más de lo que
// se vende en la Argentina, pero su buscador público es por TEXTO, no por
// código exacto — así que antes de usar una foto hay que confirmar que el
// resultado sea realmente el mismo producto, o corremos el riesgo de
// mostrar la foto de una presentación distinta.
//
// Cómo validamos: normalizamos nombre buscado y título del resultado
// (minúsculas, sin tildes, sin puntuación) y exigimos que al menos el 60%
// de las palabras "significativas" (largo > 2) del nombre del producto
// aparezcan en el título.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesLookAlike(productName: string, listingTitle: string): boolean {
  const wanted = new Set(normalizeForMatch(productName).split(' ').filter((w) => w.length > 2));
  if (!wanted.size) return false;
  const found = new Set(normalizeForMatch(listingTitle).split(' ').filter((w) => w.length > 2));
  let hits = 0;
  wanted.forEach((w) => {
    if (found.has(w)) hits++;
  });
  return hits / wanted.size >= 0.6;
}

async function probeMercadoLibre(ean: string, name: string | undefined, deadline: number): Promise<Probe> {
  // Sin nombre no hay con qué validar, y no queremos arriesgarnos a mostrar
  // una foto que no sea del producto correcto — mejor sin foto que una
  // equivocada.
  if (!name) return MISS;
  const ms = budget(deadline);
  if (!ms) return ERROR;
  try {
    const res = await fetchWithTimeout(
      `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(ean)}&limit=5`,
      { headers: ML_HEADERS, next: { revalidate: PROVIDER_REVALIDATE } },
      ms
    );
    if (isTransient(res.status)) return ERROR;
    if (!res.ok) return MISS;
    const data = await res.json();
    const results: unknown = data?.results;
    if (!Array.isArray(results)) return MISS;
    const match = results.find(
      (r) =>
        r && typeof r === 'object' && typeof (r as any).title === 'string' && titlesLookAlike(name, (r as any).title)
    ) as { thumbnail?: string } | undefined;
    return typeof match?.thumbnail === 'string' ? { status: 'hit', url: match.thumbnail } : MISS;
  } catch {
    return ERROR;
  }
}

// --- Nivel 1: Open * Facts ---------------------------------------------
async function probeOpenFacts(domain: string, ean: string, deadline: number): Promise<Probe> {
  const ms = budget(deadline);
  if (!ms) return ERROR;
  try {
    const res = await fetchWithTimeout(
      // Los productos se muestran a lo sumo a 104px (el "hero" del detalle;
      // en la lista son 54px). image_front_url es la foto ORIGINAL que
      // sube cada usuario — puede pesar varios MB — así que se prefieren
      // las versiones ya redimensionadas por OFF (_small_ ~200px, _thumb_
      // ~100px) y la original queda como último recurso.
      `https://${domain}/api/v2/product/${ean}.json?fields=image_front_small_url,image_small_url,image_front_thumb_url,image_thumb_url,image_front_url,image_url`,
      { headers: OFF_HEADERS, next: { revalidate: PROVIDER_REVALIDATE } },
      ms
    );
    // 404 = esa base no tiene el producto (no es un fallo).
    if (res.status === 404) return MISS;
    if (isTransient(res.status)) return ERROR;
    if (!res.ok) return MISS;
    const data = await res.json();
    if (data?.status !== 1) return MISS;
    const url: string | null =
      data?.product?.image_front_small_url ||
      data?.product?.image_small_url ||
      data?.product?.image_front_thumb_url ||
      data?.product?.image_thumb_url ||
      data?.product?.image_front_url ||
      data?.product?.image_url ||
      null;
    return url ? { status: 'hit', url } : MISS;
  } catch {
    // timeout o red: esa base no pudo contestar. NO es "no la tiene".
    return ERROR;
  }
}

// --- Nivel 2: tiendas VTEX ----------------------------------------------
// VTEX sirve las imágenes en tamaño grande; pidiendo /ids/<id>-200-200/ se
// bajan ya redimensionadas (para un cuadradito de 54-104px).
function vtexThumb(u: string): string {
  return u.replace(/^http:/, 'https:').replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//, '/ids/$1-200-200/');
}

async function probeVtex(host: string, ean: string, deadline: number): Promise<Probe> {
  const ms = budget(deadline);
  if (!ms) return ERROR;
  try {
    const res = await fetchWithTimeout(
      `https://${host}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
      { headers: ML_HEADERS, next: { revalidate: PROVIDER_REVALIDATE } },
      ms
    );
    if (isTransient(res.status)) return ERROR;
    if (!res.ok) return MISS; // VTEX responde 200/206 con resultados
    const data = await res.json();
    if (!Array.isArray(data)) return MISS;
    const target = normalizeEan(ean);
    for (const product of data) {
      const items: any[] = Array.isArray(product?.items) ? product.items : [];
      for (const item of items) {
        // Por las dudas: que el código del ítem sea REALMENTE el buscado.
        if (normalizeEan(item?.ean) !== target) continue;
        const img: unknown = item?.images?.[0]?.imageUrl;
        if (typeof img === 'string' && img) return { status: 'hit', url: vtexThumb(img) };
      }
    }
    return MISS;
  } catch {
    return ERROR;
  }
}

// Consulta un grupo de fuentes en paralelo y devuelve la primera con foto,
// en el orden de la lista (no en el orden en que respondan).
function firstHit(probes: Probe[]): string | null {
  const hit = probes.find(
    (p): p is { status: 'hit'; url: string } => p.status === 'hit' && isAllowedImageHost(p.url)
  );
  return hit ? hit.url : null;
}

// Solo se devuelven fotos de dominios que la CSP de la app deja cargar (ver
// img-src en proxy.ts). Si una fuente devolviera una foto de otro dominio, el
// navegador la bloquearía y el producto quedaría con la imagen rota en vez de
// pasar a la fuente siguiente.
const ALLOWED_IMAGE_HOSTS = [
  'openfoodfacts.org',
  'openbeautyfacts.org',
  'openpetfoodfacts.org',
  'openproductsfacts.org',
  'vtexassets.com',
  // Tiendas VTEX más viejas sirven las fotos desde este dominio.
  'vteximg.com.br',
  'mlstatic.com',
];
function isAllowedImageHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_IMAGE_HOSTS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

// Foto de UN producto, pasando por los niveles en orden. `complete` es false
// si ninguna fuente tuvo foto Y alguna falló (no se puede afirmar "sin foto").
async function resolveOne(
  ean: string,
  name: string | undefined,
  deadline: number,
  limit: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<{ url: string | null; complete: boolean }> {
  let failed = false;

  // Nivel 1: bases abiertas, en paralelo (cada una cubre un rubro).
  const l1 = await Promise.all(OFF_DOMAINS.map((d) => limit(() => probeOpenFacts(d, ean, deadline))));
  const u1 = firstHit(l1);
  if (u1) return { url: u1, complete: true };
  if (l1.some((p) => p.status === 'error')) failed = true;

  // Nivel 2: las 4 tiendas grandes por código de barras exacto. Solo si el
  // nivel 1 no tuvo.
  const l2 = await Promise.all(VTEX_STORES.map((h) => limit(() => probeVtex(h, ean, deadline))));
  const u2 = firstHit(l2);
  if (u2) return { url: u2, complete: true };
  if (l2.some((p) => p.status === 'error')) failed = true;

  // Nivel 2b: segundo grupo de tiendas. Solo si el primero no tuvo nada.
  const l2b = await Promise.all(VTEX_STORES_2.map((h) => limit(() => probeVtex(h, ean, deadline))));
  const u2b = firstHit(l2b);
  if (u2b) return { url: u2b, complete: true };
  if (l2b.some((p) => p.status === 'error')) failed = true;

  // Nivel 3: MercadoLibre, validando el título. Último recurso.
  const l3 = await limit(() => probeMercadoLibre(ean, name, deadline));
  if (l3.status === 'hit' && isAllowedImageHost(l3.url)) return { url: l3.url, complete: true };
  if (l3.status === 'error') failed = true;

  return { url: null, complete: !failed };
}

export async function GET(request: NextRequest) {
  if (await isRateLimited(request, 'imagenes', RATE_LIMITS.imagenes)) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  // eans y names viajan en paralelo (mismo índice = mismo producto). names
  // es opcional: cada nombre va con encodeURIComponent individual (así una
  // coma dentro de un nombre no rompe el separador), así que se decodifica
  // por segmento antes de usarlo.
  const rawEans = (request.nextUrl.searchParams.get('eans') || '').split(',').map((e) => e.trim());
  const rawNames = (request.nextUrl.searchParams.get('names') || '').split(',');

  const nameByEan = new Map<string, string>();
  rawEans.forEach((ean, i) => {
    if (!isValidEan(ean)) return;
    const raw = rawNames[i];
    if (!raw) return;
    try {
      const decoded = decodeURIComponent(raw).trim();
      if (decoded) nameByEan.set(ean, decoded);
    } catch {
      // nombre mal codificado: seguimos sin él, no es motivo para cortar todo
    }
  });

  const eans = Array.from(new Set(rawEans.filter(isValidEan))).slice(0, MAX_EANS);

  if (!eans.length) {
    return NextResponse.json({ error: 'Falta el parámetro "eans".' }, { status: 400 });
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const limit = createLimiter(MAX_CONCURRENT_CALLS);

  // Los productos van en paralelo entre sí; cada uno recorre sus niveles en
  // orden.
  const results = await Promise.all(eans.map((ean) => resolveOne(ean, nameByEan.get(ean), deadline, limit)));

  const imagenes: Record<string, string | null> = {};
  const pendientes: string[] = [];
  eans.forEach((ean, i) => {
    imagenes[ean] = results[i].url;
    if (!results[i].url && !results[i].complete) pendientes.push(ean);
  });

  // Caché según qué tan firme es la respuesta: todas con foto = un mes;
  // alguna "sin foto" confirmada = un día (alguien puede cargarla); alguna
  // fuente falló = un minuto (que se reintente enseguida).
  const anyMiss = eans.some((e) => !imagenes[e]);
  const maxAge = pendientes.length ? PENDING_CACHE_SECONDS : anyMiss ? MISS_CACHE_SECONDS : CACHE_SECONDS;

  return NextResponse.json(
    { imagenes, pendientes },
    {
      headers: {
        // Que el navegador y el CDN también se lo guarden: si la persona
        // vuelve a la misma lista, las fotos salen al instante.
        'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${pendientes.length ? 0 : 86400}`,
      },
    }
  );
}
