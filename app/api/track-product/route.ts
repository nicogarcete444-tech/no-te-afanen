import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRateLimited, isValidProductId, sanitizeQuery } from '@/lib/apiSecurity';
import { readJsonBody } from '@/lib/readJsonBody';
import { eanExistsInPreciosClaros } from '@/lib/referenceStores';

// Escribe con la service_role key, no con la anon key.
//
// tracked_products ya no tiene policy de insert/update para nadie (ver
// supabase/schema.sql): la anon key es pública por diseño, así que dejarle
// escribir directo era una puerta abierta a inflar la tabla saltándose el
// rate limit de esta misma ruta. La service_role ignora RLS por completo,
// así que la única forma de llegar a esta tabla pasa OBLIGATORIAMENTE por
// acá — y por el isRateLimited de más abajo.

export async function POST(request: NextRequest) {
  if (await isRateLimited(request, 'track-product')) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  const body = await readJsonBody<{ ean?: unknown; nombre?: unknown }>(request, 4096);
  if (!body) {
    const tooLarge = Number(request.headers.get('content-length')) > 4096;
    return NextResponse.json({ error: tooLarge ? 'Body demasiado grande.' : 'Body inválido.' }, { status: tooLarge ? 413 : 400 });
  }

  const ean = typeof body?.ean === 'string' ? body.ean : null;
  const nombre = sanitizeQuery(typeof body?.nombre === 'string' ? body.nombre : null, 200);

  if (!isValidProductId(ean)) {
    return NextResponse.json({ error: 'El parámetro "ean" es inválido o falta.' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    // Sin SUPABASE_SERVICE_ROLE_KEY configurada (ej: entorno de demo) esto
    // no es un error fatal — el historial de precios simplemente no
    // funciona todavía.
    return NextResponse.json({ tracked: false });
  }

  // Un EAN que ya está en la cola se actualiza sin más. Uno nuevo se valida
  // contra Precios Claros antes de ocupar un cupo: el regex solo mira la forma
  // (4–20 dígitos), no que el producto exista.
  const { data: already } = await admin.from('tracked_products').select('ean').eq('ean', ean).maybeSingle();
  if (!already && !(await eanExistsInPreciosClaros(ean))) {
    return NextResponse.json({ tracked: false });
  }

  const { data: tracked, error } = await admin.rpc('track_product_limited', {
    p_ean: ean,
    p_nombre: nombre,
  });

  if (error) {
    console.error('[track-product]', error.message);
    return NextResponse.json({ error: 'No se pudo registrar el producto.' }, { status: 500 });
  }
  return NextResponse.json({ tracked: tracked === true });
}
