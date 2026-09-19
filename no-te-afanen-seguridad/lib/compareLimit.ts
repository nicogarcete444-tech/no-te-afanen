import { createClient } from '@/lib/supabase/client';

// Tope de veces por semana que una cuenta free puede usar "Comparar ahora"
// (ver el resto de la explicación en supabase/schema.sql, tabla
// compare_usage). Invitados (sin cuenta) también caen acá, igual que con
// el tope del carrito en lib/premium.ts.
export const FREE_COMPARE_LIMIT = 3;

// Lunes de la semana de `date`, como "YYYY-MM-DD" en hora local (no UTC,
// para que la semana cambie a la medianoche del usuario y no a la de UTC).
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

type GuestUsage = { weekStart: string; count: number };

const GUEST_COMPARE_KEY = 'noteafanen_guest_compare_usage';

function loadGuestUsage(): GuestUsage {
  const weekStart = getWeekStart();
  if (typeof window === 'undefined') return { weekStart, count: 0 };
  try {
    const raw = window.localStorage.getItem(GUEST_COMPARE_KEY);
    if (!raw) return { weekStart, count: 0 };
    const parsed = JSON.parse(raw);
    // si cambió la semana, el contador vuelve a 0 (no hace falta borrar
    // nada, simplemente se ignora lo guardado de la semana anterior)
    if (parsed.weekStart !== weekStart) return { weekStart, count: 0 };
    return { weekStart, count: Number(parsed.count) || 0 };
  } catch {
    return { weekStart, count: 0 };
  }
}

function saveGuestUsage(usage: GuestUsage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_COMPARE_KEY, JSON.stringify(usage));
  } catch {
    // si el navegador bloquea localStorage no hay mucho para hacer acá;
    // en el peor caso el invitado no queda limitado, no es grave.
  }
}

// Comparaciones ya "pagadas": si el usuario ya gastó un uso para ver ESTE
// carrito en ESTA semana, recargar la página o volver más tarde no le
// cobra otro. Sin esto, con solo 3 usos por semana, un F5 sin querer le
// come un tercio de la cuota — y el usuario no está pidiendo nada nuevo,
// es la misma comparación que ya desbloqueó.
const REVEALED_KEY = 'noteafanen_compare_revealed';

// Firma del carrito: qué productos y en qué cantidad. Si el usuario agrega
// o saca algo, es una comparación distinta y sí corresponde cobrarla.
export function cartSignature(items: Record<string, number>): string {
  return Object.entries(items)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => `${id}:${qty}`)
    .sort()
    .join('|');
}

export function wasAlreadyRevealed(signature: string): boolean {
  if (typeof window === 'undefined' || !signature) return false;
  try {
    const raw = window.localStorage.getItem(REVEALED_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed.weekStart === getWeekStart() && Array.isArray(parsed.signatures)
      ? parsed.signatures.includes(signature)
      : false;
  } catch {
    return false;
  }
}

export function markRevealed(signature: string): void {
  if (typeof window === 'undefined' || !signature) return;
  try {
    const weekStart = getWeekStart();
    const raw = window.localStorage.getItem(REVEALED_KEY);
    let signatures: string[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.weekStart === weekStart && Array.isArray(parsed.signatures)) {
        signatures = parsed.signatures;
      }
    }
    if (!signatures.includes(signature)) signatures.push(signature);
    // nunca hace falta guardar más firmas que usos hay en la semana
    window.localStorage.setItem(
      REVEALED_KEY,
      JSON.stringify({ weekStart, signatures: signatures.slice(-FREE_COMPARE_LIMIT) })
    );
  } catch {
    // sin localStorage el usuario simplemente vuelve a gastar un uso al
    // recargar; molesto, pero no rompe nada.
  }
}

// Cuántas veces ya comparó en la semana en curso.
export async function getCompareUsage(userId: string | null): Promise<number> {
  if (!userId) return loadGuestUsage().count;

  const supabase = createClient();
  const { data } = await supabase
    .from('compare_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('week_start', getWeekStart())
    .maybeSingle();

  return data?.count ?? 0;
}

// Suma un uso y devuelve el nuevo total de la semana. Se llama justo antes
// de mostrarle al usuario el desglose por súper (no antes: si algo falla en
// el medio, mejor no haber gastado un uso de arriba).
export async function registerCompareUse(userId: string | null): Promise<number> {
  const weekStart = getWeekStart();

  if (!userId) {
    const usage = loadGuestUsage();
    const next = { weekStart, count: usage.count + 1 };
    saveGuestUsage(next);
    return next.count;
  }

  const supabase = createClient();
  const current = await getCompareUsage(userId);
  const next = current + 1;

  const { error } = await supabase.from('compare_usage').upsert(
    { user_id: userId, week_start: weekStart, count: next, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,week_start' }
  );

  if (error) {
    console.error('No se pudo registrar el uso de "Comparar ahora":', error.message);
  }

  return next;
}
