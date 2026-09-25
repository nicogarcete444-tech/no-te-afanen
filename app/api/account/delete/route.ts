import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp, isRateLimited } from '@/lib/apiSecurity';

// Elimina la cuenta del usuario que hace el pedido (nunca la de otro: el id
// se saca de la sesión, no del body). Borra el registro de auth.users con
// la service_role key; todas las tablas propias del usuario (ahorros,
// alertas de precio, premium, carrito, etc.) tienen "on delete cascade"
// contra auth.users en supabase/schema.sql, así que se van solas con esta
// única llamada — no hace falta borrar tabla por tabla acá.
export async function POST(request: NextRequest) {
  if (isRateLimited('account-delete:' + getClientIp(request), 5)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Tenés que iniciar sesión.' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'No se pudo completar la baja en este momento. Probá de nuevo más tarde.' },
      { status: 503 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[account-delete]', error.message);
    return NextResponse.json({ error: 'No pudimos eliminar la cuenta. Probá de nuevo en un momento.' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
