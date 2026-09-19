import { createClient } from '@/lib/supabase/client';

// El alta Premium se coordina por WhatsApp: el usuario toca "Quiero Premium",
// se abre el chat con el mensaje ya escrito (incluyendo su email, para poder
// identificarlo), arregla el pago, y vos le cargás la fila a mano en Supabase.
//
// No hay checkout automático. Antes existía uno con Mercado Pago
// (Preapproval) y quedaron dando vueltas tres rutas de API, un webhook y un
// par de variables de entorno que ya no llamaba nadie. Todo eso se sacó: si
// algún día vuelve el cobro automático, conviene escribirlo de cero contra la
// API que esté vigente en ese momento y no resucitar código sin usar.
//
// Nunca hubo ni hay forma de que un usuario se ponga premium a sí mismo desde
// el navegador: premium_status no tiene policy de insert/update para el
// usuario final (ver supabase/schema.sql), solo puede leer su propio estado.

// Cuánto dura un alta manual si no se le puso fecha de vencimiento explícita.
export const MANUAL_GRANT_DURATION_DAYS = 30;

export type PremiumStatusRow = {
  is_premium: boolean | null;
  since: string | null;
  premium_until: string | null;
};

// Cuándo se le termina el premium a esta fila (o null si no vence).
export function premiumExpiresAt(row: PremiumStatusRow | null | undefined): Date | null {
  if (!row?.is_premium) return null;
  // Fecha explícita: es la que manda. Es lo que conviene usar siempre al
  // cargar un alta a mano ("premium hasta tal día").
  if (row.premium_until) return new Date(row.premium_until);
  // Sin fecha explícita, se cuenta un mes desde el alta. Así un premium
  // cargado a mano no queda activo para siempre por olvido.
  if (row.since) {
    return new Date(new Date(row.since).getTime() + MANUAL_GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);
  }
  return null;
}

// Función pura (sin fetch): dada una fila de premium_status, dice si ESE
// premium está vigente ahora mismo. La usan isPremium() de acá abajo, el
// dashboard de /admin, y la copia exacta de esta lógica vive también como
// is_premium_user() en supabase/schema.sql — los triggers que aplican los
// topes free tienen que decidir lo mismo que la app, si no pasa lo que pasaba
// antes: la app daba por vencido un premium manual al mes, pero la base lo
// seguía tratando como premium para siempre.
export function isPremiumStatusActive(row: PremiumStatusRow | null | undefined): boolean {
  if (!row?.is_premium) return false;
  const expiresAt = premiumExpiresAt(row);
  if (!expiresAt) return true; // sin fecha para comparar, no lo vencemos a ciegas
  return Date.now() < expiresAt.getTime();
}

export async function isPremium(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = createClient();
  const { data } = await supabase
    .from('premium_status')
    .select('is_premium, since, premium_until')
    .eq('user_id', userId)
    .maybeSingle();

  return isPremiumStatusActive(data);
}

// Estado completo (para poder mostrarle al usuario hasta cuándo le dura).
export async function getPremiumStatus(userId: string | null): Promise<PremiumStatusRow | null> {
  if (!userId) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('premium_status')
    .select('is_premium, since, premium_until')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// Tope de productos DISTINTOS en el carrito para cuentas free (no cuenta
// cantidad: 3 unidades del mismo producto siguen siendo "1 producto" a
// estos efectos). Invitados (sin cuenta) también caen en el límite free.
export const FREE_CART_PRODUCT_LIMIT = 10;
