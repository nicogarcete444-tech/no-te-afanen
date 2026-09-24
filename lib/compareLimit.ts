import { createClient } from '@/lib/supabase/client';

// Tope de veces por semana que una cuenta free puede usar "Comparar ahora"
// (ver el resto de la explicación en supabase/schema.sql, tabla
// compare_usage). El límite en sí se aplica y se cuenta del lado del server
// (register_compare_use en supabase/schema.sql) — este archivo no guarda ni
// decide nada por su cuenta, solo llama al RPC y devuelve lo que contesta.
export const FREE_COMPARE_LIMIT = 3;

// "Comparar ahora" pide cuenta. Antes los invitados (sin login) tenían su
// propio contador en localStorage — no era una cuota real: se reseteaba
// solo con abrir una ventana de incógnito o borrar los datos del sitio, así
// que cualquiera podía usarla sin límite. Se sacó junto con el resto de la
// lógica de localStorage de este archivo; sin una sesión no hay forma
// honesta de atarle un tope a nadie del lado del server.

// Lunes de la semana de `date`, como "YYYY-MM-DD" en hora local (no UTC,
// para que la semana cambie a la medianoche del usuario y no a la de UTC).
// Se usa solo para mostrar/depurar en el cliente — quien decide de verdad
// en qué semana cae un uso es register_compare_use, calculado en el server
// a partir del offset horario (ver más abajo), no de esta fecha.
export function getWeekStart(date: Date = new Date()): string {
  const day = date.getDay(); // 0 = domingo … 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Firma del carrito: qué productos y en qué cantidad. Si el usuario agrega
// o saca algo, es una comparación distinta y sí corresponde cobrarla. Se
// manda al RPC (`p_signature`) para que el server pueda reconocer "este
// carrito ya se desbloqueó esta semana" y no cobrar de nuevo al recargar la
// página — antes eso vivía en localStorage (wasAlreadyRevealed/
// markRevealed); ahora la garantía la da la fila de compare_usage, y vale
// para la cuenta en cualquier dispositivo, no solo en el navegador donde se
// tocó "Comparar ahora" la primera vez.
export function cartSignature(items: Record<string, number>): string {
  return Object.entries(items)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => `${id}:${qty}`)
    .sort()
    .join('|');
}

// Cuántas veces ya comparó en la semana en curso. Solo para mostrar "te
// quedan N" antes de tocar el botón — el chequeo que de verdad importa pasa
// por registerCompareUse.
export async function getCompareUsage(userId: string | null): Promise<number> {
  if (!userId) return 0;

  const supabase = createClient();
  const { data } = await supabase
    .from('compare_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('week_start', getWeekStart())
    .maybeSingle();

  return data?.count ?? 0;
}

// Suma un uso y devuelve si el server lo permitió, más el total actualizado
// de la semana. Se llama ANTES de mostrar el desglose (no después): la
// revelación depende de lo que este RPC conteste, no de un cálculo hecho en
// el navegador — ver register_compare_use en supabase/schema.sql para el
// resto (evitar semanas inventadas, carreras entre dos pestañas, y el
// dedupe de "mismo carrito, no cobrar de nuevo").
// `failed: true` = no se pudo hablar con el server (sin red, Supabase caído).
// NO es lo mismo que "ya no te quedan usos": antes los dos casos se
// devolvían como count = tope, y ante un simple corte de red la pantalla
// decía "Ya usaste tus 3 comparaciones" y dejaba el botón trabado hasta
// recargar, aunque la persona no hubiera gastado ninguna.
export type CompareUseResult = { allowed: boolean; count: number; failed?: boolean };

export async function registerCompareUse(
  userId: string | null,
  signature: string
): Promise<CompareUseResult> {
  if (!userId) {
    // Sin cuenta no hay identidad que el server pueda validar — no se le da
    // una revelación gratis solo porque el cliente lo pida.
    return { allowed: false, count: 0 };
  }

  const supabase = createClient();
  // getTimezoneOffset() da minutos a SUMAR a la hora local para llegar a UTC
  // (positivo si estás atrás de UTC, ej. 180 en Argentina) — el signo
  // contrario de lo que la función de Postgres necesita para ir de UTC a
  // hora local, por eso se manda invertido.
  const { data, error } = await supabase.rpc('register_compare_use', {
    p_user_id: userId,
    p_utc_offset_minutes: -new Date().getTimezoneOffset(),
    p_signature: signature || null,
  });

  if (error || !data) {
    console.error('No se pudo registrar el uso de "Comparar ahora":', error?.message);
    // Sin respuesta del server no hay forma honesta de decir que sí: no se
    // revela el desglose, pero tampoco se toca el contador que se muestra:
    // el que llama avisa que fue un problema de conexión y deja reintentar.
    return { allowed: false, count: 0, failed: true };
  }

  return { allowed: Boolean(data.allowed), count: Number(data.count) || 0 };
}
