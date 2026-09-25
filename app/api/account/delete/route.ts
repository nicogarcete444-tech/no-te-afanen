import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRateLimited } from '@/lib/apiSecurity';
import { readJsonBody } from '@/lib/readJsonBody';

// Baja de cuenta iniciada por la propia persona (Ley 25.326: derecho de
// supresión). Borra el usuario de auth.users; todas las tablas con datos
// personales (carts, savings_log, price_alerts, price_drop_notifications,
// push_subscriptions, premium_status, compare_usage) tienen FK con
// ON DELETE CASCADE hacia auth.users, así que se van con él.
//
// Requiere sesión válida (getUser contra Auth, no una cookie sin verificar) y
// una confirmación explícita en el body para que no dispare por accidente.
export async function POST(request: NextRequest) {
  if (await isRateLimited(request, 'account-delete', 5)) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  const body = await readJsonBody<{ confirm?: unknown }>(request, 1024);
  if (!body || body.confirm !== 'ELIMINAR') {
    return NextResponse.json({ error: 'Falta la confirmación.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No hay sesión.' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'No se pudo eliminar la cuenta en este momento.' }, { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[account/delete]', error.message);
    return NextResponse.json({ error: 'No se pudo eliminar la cuenta.' }, { status: 500 });
  }

  // Limpia las cookies de sesión de este navegador (el token ya no vale).
  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ deleted: true });
}
