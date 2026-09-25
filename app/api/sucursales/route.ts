import { NextRequest, NextResponse } from 'next/server';
import { PRECIOS_CLAROS_BASE, fetchPreciosClaros } from '@/lib/preciosClarosBase';
import { getClientIp, isRateLimited, parseLat, parseLimit, parseLng, RATE_LIMITS } from '@/lib/apiSecurity';

// Igual que /api/productos: le da margen al timeout + reintento de
// fetchPreciosClaros.
export const maxDuration = 20;

// Igual que /api/productos: corre en el servidor de Vercel para evitar CORS.
export async function GET(request: NextRequest) {
  if (isRateLimited('sucursales:' + getClientIp(request), RATE_LIMITS.sucursales)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Esperá un momento.' }, { status: 429 });
  }

  const lat = parseLat(request.nextUrl.searchParams.get('lat'));
  const lng = parseLng(request.nextUrl.searchParams.get('lng'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'), 200, 500);

  if (lat === null || lng === null) {
    return NextResponse.json({ error: 'Faltan o son inválidos los parámetros "lat" y "lng".' }, { status: 400 });
  }

  const url = `${PRECIOS_CLAROS_BASE}/sucursales?lat=${lat}&lng=${lng}&limit=${limit}`;

  try {
    // Las sucursales casi no cambian (abre o cierra un local cada tanto),
    // así que acá sí conviene un caché largo: 24 h.
    const upstream = await fetchPreciosClaros(url, 60 * 60 * 24);

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
