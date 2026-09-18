import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Guarda (o actualiza) la PushSubscription del usuario logueado. Requiere
// sesión: las alertas push, igual que las de bajada de precio in-app, están
// atadas a la cuenta, no a un dispositivo anónimo.
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  const p256dh = typeof body?.p256dh === 'string' ? body.p256dh : null;
  const auth = typeof body?.auth === 'string' ? body.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Faltan datos de la suscripción.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Hay que iniciar sesión para activar los avisos push.' }, { status: 401 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscribed: true });
}
