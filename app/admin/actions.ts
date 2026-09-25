'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/adminAuth';
import { MANUAL_GRANT_DURATION_DAYS } from '@/lib/premium';

// Nunca confiar en que solo un admin puede LLAMAR a esto: aunque el botón
// solo se ve en /admin, una server action queda expuesta como endpoint. Por
// eso cada función vuelve a chequear la sesión y el email acá adentro, igual
// que hace la página, antes de tocar la tabla con la service_role key.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user)) {
    throw new Error('No autorizado');
  }
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }
  return admin;
}

export type AdminActionResult = { ok: true } | { ok: false; error: string };

// Da (o renueva) premium: si la persona ya tenía uno vigente, el nuevo mes
// se suma a partir de hoy o de su vencimiento actual (lo que sea más
// adelante), para no hacerle perder días pagados. Si no tenía, arranca hoy.
export async function grantPremium(userId: string): Promise<AdminActionResult> {
  try {
    const admin = await requireAdmin();
    const { data: existing } = await admin
      .from('premium_status')
      .select('premium_until')
      .eq('user_id', userId)
      .maybeSingle();

    const base =
      existing?.premium_until && new Date(existing.premium_until).getTime() > Date.now()
        ? new Date(existing.premium_until)
        : new Date();
    const premiumUntil = new Date(base.getTime() + MANUAL_GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { error } = await admin.from('premium_status').upsert(
      {
        user_id: userId,
        is_premium: true,
        since: new Date().toISOString(),
        premium_until: premiumUntil.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) return { ok: false, error: error.message };

    revalidatePath('/admin');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Error desconocido' };
  }
}

// Corta el premium ya mismo (no espera a que venza la fecha).
export async function revokePremium(userId: string): Promise<AdminActionResult> {
  try {
    const admin = await requireAdmin();
    const { error } = await admin
      .from('premium_status')
      .update({ is_premium: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/admin');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Error desconocido' };
  }
}
