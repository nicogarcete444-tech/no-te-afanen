import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, isRateLimited, RATE_LIMITS } from '@/lib/apiSecurity';
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
// La respuesta se cachea un mes: la foto de un producto no cambia (y si no
// tiene, tampoco aparece de un día para el otro).

const OFF_DOMAINS = [
  'world.openfoodfacts.org',      // alimentos y bebidas
  'world.openbeautyfacts.org',    // perfumería / cosmética
  'world.openproductsfacts.org',  // limpieza y productos generales
];

const MAX_EANS = 60;
const CACHE_SECONDS = 60 * 60 * 24 * 30; // un mes

// Open Food Facts pide identificarse. Sin esto, los pedidos anónimos entran
// en la cola lenta o directamente se rechazan.
const OFF_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios; https://github.com/no-te-afanen)',
  Accept: 'application/json',
};

// MercadoLibre también pide un User-Agent propio para no caer en el límite
// anónimo más agresivo.
const ML_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios)',
  Accept: 'application/json',
};

function isValidEan(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

// --- Fallback: MercadoLibre --------------------------------------------
//
// Las 3 bases de Open * Facts son crowdsourced: si nadie fotografió ESE
// producto puntual, no hay foto, sin importar el rubro (le pasa a lácteos y
// almacén igual que a limpieza). MercadoLibre cubre muchísimo más de lo que
// se vende en la Argentina, pero su buscador público es por TEXTO, no por
// código exacto — así que antes de usar una foto hay que confirmar que el
// resultado sea realmente el mismo producto, o corremos el riesgo de
// mostrar la foto de una presentación distinta.
//
// Cómo validamos: normalizamos nombre buscado y título del resultado
// (minúsculas, sin tildes, sin puntuación) y exigimos que al menos el 60%
// de las palabras "significativas" (largo > 2) del nombre del producto
// aparezcan en el título. Es una validación simple a propósito — no hace
// falta que sea perfecta, solo que filtre los casos claramente distintos.
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

async function resolveFromMercadoLibre(ean: string, name: string | undefined): Promise<string | null> {
  // Sin nombre no hay con qué validar, y no queremos arriesgarnos a mostrar
  // una foto que no sea del producto correcto — mejor sin foto que una
  // equivocada.
  if (!name) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(ean)}&limit=5`,
      { headers: ML_HEADERS, next: { revalidate: CACHE_SECONDS } },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results: unknown = data?.results;
    if (!Array.isArray(results)) return null;
    const match = results.find(
      (r) =>
        r && typeof r === 'object' && typeof (r as any).title === 'string' && titlesLookAlike(name, (r as any).title)
    ) as { thumbnail?: string } | undefined;
    return typeof match?.thumbnail === 'string' ? match.thumbnail : null;
  } catch {
    return null;
  }
}

async function lookupPhotoInDomain(domain: string, ean: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      // Los productos se muestran a lo sumo a 104px (el "hero" del detalle;
      // en la lista son 54px). image_front_url es la foto ORIGINAL que
      // sube cada usuario a Open Food Facts — puede pesar cientos de KB o
      // varios MB — y antes era la primera opción, así que se bajaba una
      // foto de varios megapíxeles para mostrar un cuadradito chico. Acá
      // pedimos también las versiones ya redimensionadas por OFF
      // (_small_, ~200px, y _thumb_, ~100px) y las preferimos: cubren
      // hasta pantallas @2x sin bajar la original salvo que no exista otra.
      `https://${domain}/api/v2/product/${ean}.json?fields=image_front_small_url,image_small_url,image_front_thumb_url,image_thumb_url,image_front_url,image_url`,
      { headers: OFF_HEADERS, next: { revalidate: CACHE_SECONDS } },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== 1) return null;
    // Orden de preferencia: primero las versiones ya redimensionadas por
    // OFF (frente chica ~200px, luego genérica chica, luego frente mini
    // ~100px, luego genérica mini). Recién si el producto no tiene
    // ninguna versión chica caemos a la foto de frente original y, como
    // último recurso, a la genérica original — de ahí para abajo puede
    // pesar varios MB, así que solo se usa cuando no queda otra.
    return (
      data?.product?.image_front_small_url ||
      data?.product?.image_small_url ||
      data?.product?.image_front_thumb_url ||
      data?.product?.image_thumb_url ||
      data?.product?.image_front_url ||
      data?.product?.image_url ||
      null
    );
  } catch {
    // esa base falló o tardó más de 4s: la tratamos como "no la tiene"
    return null;
  }
}

async function resolveOne(ean: string, name: string | undefined): Promise<string | null> {
  // Antes se probaban las 3 bases UNA POR UNA, esperando la respuesta
  // completa de cada una antes de pasar a la siguiente — hasta 3 idas y
  // vueltas en serie POR PRODUCTO, y con hasta 60 productos por pedido
  // (todos corriendo en paralelo entre sí) alcanzaba con que una sola base
  // anduviera lenta para atrasar el pedido entero. Como cada dominio cubre
  // un rubro distinto (alimentos / cosmética / el resto de los productos),
  // no hay problema en consultarlas las 3 EN PARALELO: el tiempo pasa a ser
  // el de la más lenta de las tres, no la suma.
  const results = await Promise.all(OFF_DOMAINS.map((domain) => lookupPhotoInDomain(domain, ean)));
  const found = results.find((url) => !!url);
  if (found) return found;
  // Ninguna de las 3 bases tenía nada: probamos MercadoLibre como último
  // recurso, validando el título antes de confiar en la foto.
  return resolveFromMercadoLibre(ean, name);
}

export async function GET(request: NextRequest) {
  if (isRateLimited('imagenes:' + getClientIp(request), RATE_LIMITS.imagenes)) {
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

  // En paralelo: son pedidos independientes y cacheados, no hay razón para
  // hacerlos en fila.
  const results = await Promise.all(eans.map((ean) => resolveOne(ean, nameByEan.get(ean))));

  const imagenes: Record<string, string | null> = {};
  eans.forEach((ean, i) => {
    imagenes[ean] = results[i];
  });

  return NextResponse.json(
    { imagenes },
    {
      headers: {
        // Que el navegador y el CDN también se lo guarden: si la persona
        // vuelve a la misma lista, las fotos salen al instante.
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`,
      },
    }
  );
}
