import { NextRequest, NextResponse } from 'next/server';
import { PRECIOS_CLAROS_HEADERS } from '@/lib/preciosClarosBase';
import { getClientIp, isRateLimited, parseLat, parseLimit, parseLng, RATE_LIMITS, sanitizeQuery } from '@/lib/apiSecurity';

const API_URL =
  process.env.PRECIOS_CLAROS_API_URL ||
  'https://d3e6htiiul5ek9.cloudfront.net/prod/productos';

// Este endpoint corre en el servidor de Vercel, no en el navegador del usuario.
// Por eso el bloqueo CORS de Precios Claros no aplica acá: el navegador
// le habla a NUESTRO dominio, y nosotros le hablamos a Precios Claros por atrás.
export async function GET(request: NextRequest) {
  if (isRateLimited('productos:' + getClientIp(request), RATE_LIMITS.productos)) {
    return NextResponse.json({ error: 'Demasiadas búsquedas. Esperá un momento.' }, { status: 429 });
  }

  const term = sanitizeQuery(request.nextUrl.searchParams.get('q'));
  const lat = parseLat(request.nextUrl.searchParams.get('lat'));
  const lng = parseLng(request.nextUrl.searchParams.get('lng'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'), 12, 50);

  if (!term || term.length < 2) {
    return NextResponse.json(
      { error: 'Falta el parámetro "q" con al menos 2 caracteres.' },
      { status: 400 }
    );
  }

  // La API de Precios Claros exige lat/lng para poder buscar productos
  // (los usa para priorizar resultados de sucursales cercanas).
  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: 'Faltan o son inválidos los parámetros "lat" y "lng".' },
      { status: 400 }
    );
  }

  const url = `${API_URL}?string=${encodeURIComponent(term)}&lat=${lat}&lng=${lng}&offset=0&limit=${limit}&sort=-cant_sucursales_disponible`;

  try {
    const upstream = await fetch(url, {
      headers: PRECIOS_CLAROS_HEADERS,
      // Seis horas. Los precios cambian durante el día (promos, ajustes de
      // lista) y esto alimenta la vidriera: una semana de caché, como estaba
      // antes, mostraba precios que ya no existían.
      next: { revalidate: 60 * 60 * 6 },
    });

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
