import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, isRateLimited, isValidProductId, sanitizeQuery } from '@/lib/apiSecurity';

// Cliente sin sesión (no hace falta cookie de usuario: cualquiera puede
// "avisar" que vio un producto, la tabla no tiene datos privados). Usa la
// anon key, así que respeta las policies de tracked_products del schema.
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  if (isRateLimited('track-product:' + getClientIp(request))) {
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

  const supabase = anonClient();
  if (!supabase) {
    // Sin Supabase configurado (ej: entorno de demo) esto no es un error
    // fatal — el historial de precios simplemente no funciona todavía.
    return NextResponse.json({ tracked: false });
  }

  const { error } = await supabase
    .from('tracked_products')
    .upsert({ ean, nombre, last_seen_at: new Date().toISOString() }, { onConflict: 'ean' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tracked: true });
}
