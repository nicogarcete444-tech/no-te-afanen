import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, isRateLimited, isValidProductId } from '@/lib/apiSecurity';

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
  'world.openproductsfacts.org',
];

const CACHE_SECONDS = 60 * 60 * 24 * 30; // un mes

const OFF_HEADERS = {
  'User-Agent': 'NoTeAfanen/1.0 (comparador de precios; https://github.com/no-te-afanen)',
  Accept: 'application/json',
};

export async function GET(request: NextRequest) {
  if (isRateLimited('nombre-producto:' + getClientIp(request))) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  const ean = request.nextUrl.searchParams.get('ean');
  if (!isValidProductId(ean)) {
    return NextResponse.json({ error: 'El parámetro "ean" es inválido o falta.' }, { status: 400 });
  }

  for (const domain of OFF_DOMAINS) {
    try {
      const res = await fetch(
        `https://${domain}/api/v2/product/${ean}.json?fields=product_name,product_name_es,generic_name,generic_name_es,brands`,
        { headers: OFF_HEADERS, next: { revalidate: CACHE_SECONDS } }
      );
      if (!res.ok) continue;
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
      if (data?.status === 1 && productName) {
        // Anteponer la marca ayuda a que la búsqueda en Precios Claros (que
        // matchea por texto) encuentre el producto correcto y no uno genérico
        // con el mismo nombre de otra marca.
        const firstBrand = brand ? brand.split(',')[0].trim() : '';
        const nombre =
          firstBrand && !productName.toLowerCase().includes(firstBrand.toLowerCase())
            ? `${firstBrand} ${productName}`
            : productName;
        return NextResponse.json(
          { nombre },
          { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }
        );
      }
    } catch {
      // esa base falló: probamos con la siguiente
    }
  }

  return NextResponse.json({ nombre: null });
}
