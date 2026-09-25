import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, isValidProductId } from '@/lib/apiSecurity';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

// Traduce un código de barras a un nombre de producto, usando las bases
// públicas de Open * Facts. Lo usa el escáner: Precios Claros solo busca por
// nombre, así que primero hay que saber qué producto es ese código.
//
// Antes esto se pedía desde el navegador. Va por acá por los mismos motivos
// que /api/imagenes: podemos mandar un User-Agent propio (Open Food Facts lo
// pide), el resultado queda cacheado para todos los usuarios, y no depende de
// que el navegador o un bloqueador permitan pedidos a dominios de terceros.

const OFF_DOMAINS = [
  'world.openfoodfacts.org',
  'world.openbeautyfacts.org',
  'world.openpetfoodfacts.org',
  'world.openproductsfacts.org',
];

const CACHE_SECONDS = 60 * 60 * 24 * 30; // un mes

const OFF_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios; https://github.com/no-te-afanen)',
  Accept: 'application/json',
};

// Devuelve el nombre armado (marca + nombre) para UNA base puntual, o null
// si esa base no tiene el producto / no respondió a tiempo.
async function lookupInDomain(domain: string, ean: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://${domain}/api/v2/product/${ean}.json?fields=product_name,product_name_es,generic_name,generic_name_es,brands`,
      { headers: OFF_HEADERS, next: { revalidate: CACHE_SECONDS } },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Muchos productos argentinos/regionales están cargados en Open Food
    // Facts sin "product_name" en inglés/genérico, pero sí con la versión
    // en español o con un "generic_name". Antes, si "product_name" venía
    // vacío, dábamos el producto por no encontrado (y el escáner se
    // quedaba sin nombre) aunque la base sí tuviera datos usables.
    const productName: string | undefined =
      data?.product?.product_name ||
      data?.product?.product_name_es ||
      data?.product?.generic_name ||
      data?.product?.generic_name_es;
    const brand: string | undefined = data?.product?.brands;
    if (data?.status !== 1 || !productName) return null;
    // Anteponer la marca ayuda a que la búsqueda en Precios Claros (que
    // matchea por texto) encuentre el producto correcto y no uno genérico
    // con el mismo nombre de otra marca.
    const firstBrand = brand ? brand.split(',')[0].trim() : '';
    return firstBrand && !productName.toLowerCase().includes(firstBrand.toLowerCase())
      ? `${firstBrand} ${productName}`
      : productName;
  } catch {
    // esa base falló o tardó más de 4s: la tratamos como "no lo tiene"
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (await isRateLimited(request, 'nombre-producto')) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  const ean = request.nextUrl.searchParams.get('ean');
  if (!isValidProductId(ean)) {
    return NextResponse.json({ error: 'El parámetro "ean" es inválido o falta.' }, { status: 400 });
  }

  // Antes se consultaban las 3 bases UNA POR UNA (esperando la respuesta
  // completa de cada una antes de probar la siguiente): si la primera
  // tardaba o se colgaba, el escaneo entero quedaba esperando esos segundos
  // de más aunque el producto estuviera en la segunda base. Como cada
  // dominio cubre un rubro distinto (alimentos / cosmética / el resto), no
  // hay problema en pedirlas las 3 EN PARALELO y quedarnos con la primera
  // que responda algo útil — el tiempo total pasa a ser el de la más lenta
  // de las tres, no la SUMA de las tres.
  const results = await Promise.all(OFF_DOMAINS.map((domain) => lookupInDomain(domain, ean)));
  const nombre = results.find((n) => !!n) ?? null;

  return NextResponse.json(
    { nombre },
    nombre ? { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } } : undefined
  );
}
