import { NextRequest, NextResponse } from 'next/server';
import { PRECIOS_CLAROS_BASE, fetchPreciosClaros } from '@/lib/preciosClarosBase';
import { getClientIp, isRateLimited, isValidProductId, isValidSucursalesArray, parseLimit, RATE_LIMITS } from '@/lib/apiSecurity';

// Igual que /api/productos: le da margen al timeout + reintento de
// fetchPreciosClaros.
export const maxDuration = 20;

// Igual que /api/productos: corre en el servidor de Vercel para evitar CORS.
export async function GET(request: NextRequest) {
  if (await isRateLimited('producto:' + getClientIp(request), RATE_LIMITS.producto)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Esperá un momento.' }, { status: 429 });
  }

  const idProducto = request.nextUrl.searchParams.get('id_producto');
  const arraySucursales = request.nextUrl.searchParams.get('array_sucursales');
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'), 30, 50);

  if (!isValidProductId(idProducto) || !isValidSucursalesArray(arraySucursales)) {
    return NextResponse.json(
      { error: 'Los parámetros "id_producto" y "array_sucursales" son inválidos o faltan.' },
      { status: 400 }
    );
  }

  const url =
    `${PRECIOS_CLAROS_BASE}/producto?id_producto=${encodeURIComponent(idProducto)}` +
    `&array_sucursales=${encodeURIComponent(arraySucursales)}&limit=${limit}`;

  try {
    // Este endpoint devuelve el precio puntual por sucursal — el número con
    // el que el usuario decide a qué súper ir. Seis horas: Precios Claros
    // publica actualizaciones a diario, así que más que eso es mostrarle
    // precios viejos (esto estaba en una semana).
    const upstream = await fetchPreciosClaros(url, 60 * 60 * 6);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'No pudimos consultar Precios Claros en este momento.' },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'No se pudo contactar a Precios Claros en este momento.' },
      { status: 502 }
    );
  }
}
