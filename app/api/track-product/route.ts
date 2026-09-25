import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp, isRateLimited, isValidProductId, sanitizeQuery } from '@/lib/apiSecurity';

// Escribe con la service_role key, no con la anon key.
//
// tracked_products ya no tiene policy de insert/update para nadie (ver
// supabase/schema.sql): la anon key es pública por diseño, así que dejarle
// escribir directo era una puerta abierta a inflar la tabla saltándose el
// rate limit de esta misma ruta. La service_role ignora RLS por completo,
// así que la única forma de llegar a esta tabla pasa OBLIGATORIAMENTE por
// acá — y por el isRateLimited de más abajo.

export async function POST(request: NextRequest) {
  if (await isRateLimited('track-product:' + getClientIp(request))) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
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

  const { error } = await admin
    .from('tracked_products')
    .upsert({ ean, nombre, last_seen_at: new Date().toISOString() }, { onConflict: 'ean' });

  if (error) {
    console.error('[track-product]', error.message);
    return NextResponse.json({ error: 'No se pudo registrar el producto.' }, { status: 500 });
  }
  return NextResponse.json({ tracked: true });
}
