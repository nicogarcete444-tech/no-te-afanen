import { createClient } from '@/lib/supabase/client';

export type MonthlySaving = {
  /** Clave ordenable, ej "2026-09" */
  month: string;
  /** Texto para mostrar, ej "sep 2026" */
  label: string;
  total: number;
};

type SavingEntry = {
  amount: number;
  createdAt: string;
  // Cuánto de ese ahorro vino de cada rubro (Limpieza, Almacén, etc.), para
  // poder armar la torta de "en qué rubro ahorrás más" en el modal. Opcional
  // porque los registros viejos (de antes de este campo) no lo tienen.
  categories?: Record<string, number>;
};

export type CategorySaving = { category: string; amount: number };

// Invitado (sin cuenta): el historial se guarda en este dispositivo. Si
// después crea una cuenta, seguimos sumando ahí sin perder lo ya guardado
// acá mientras no borre datos del navegador.
const GUEST_SAVINGS_KEY = 'noteafanen_guest_savings';
// Evita que el localStorage crezca sin límite en un uso muy prolongado.
const MAX_GUEST_ENTRIES = 1000;

function loadGuestEntries(): SavingEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_SAVINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestEntries(entries: SavingEntry[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(GUEST_SAVINGS_KEY, JSON.stringify(entries.slice(-MAX_GUEST_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  const s = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
}

/** Clave del mes actual, ej "2026-09" — se usa para el total de "este mes". */
export function currentMonthKey(): string {
  return monthKey(new Date());
}

// Registra un ahorro (por ejemplo, al confirmar/copiar la lista de compras
// terminada). Se suma al total del mes en curso. No hace nada si el monto
// es 0 o negativo, para no ensuciar el historial con compras sin ahorro.
//
// `categories` es el desglose de ESE ahorro por rubro (ej: { Limpieza: 800,
// Almacén: 1200 }), para la torta de "en qué rubro ahorrás más". Es
// opcional: si no se manda, el registro suma al total general igual, solo
// que no aporta nada a la torta.
export async function addSaving(
  userId: string | null,
  amount: number,
  categories?: Record<string, number>
): Promise<boolean> {
  if (!amount || amount <= 0) return false;

  if (!userId) {
    const entries = loadGuestEntries();
    entries.push({ amount, createdAt: new Date().toISOString(), categories });
    return saveGuestEntries(entries);
  }

  const supabase = createClient();
  const { error } = await supabase.from('savings_log').insert({
    user_id: userId,
    amount,
    categories: categories || {},
  });
  if (error) {
    // Se loguea para poder diagnosticar (ej: la tabla "savings_log" no
    // existe todavía en el proyecto de Supabase, o falta la policy de
    // insert) sin que quede en silencio total.
    console.error('No se pudo guardar el ahorro en la cuenta:', error.message);
  }
  return !error;
}

const GUEST_SAVINGS_MIGRATED_KEY = 'noteafanen_guest_savings_migrated';

// Al iniciar sesión, el historial de ahorro pasa a leerse de la cuenta
// (Supabase) en vez del localStorage del celular. Si el usuario venía
// ahorrando como invitado, esos registros quedaban "perdidos" de vista
// porque nunca se copiaban a la cuenta. Esta función los migra una sola
// vez (se marca con una bandera en localStorage para no duplicarlos si se
// vuelve a llamar en otra sesión desde el mismo navegador).
export async function migrateGuestSavingsToAccount(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  // Storage bloqueado (modo privado de algunos navegadores): getItem/setItem
  // tiran excepción y, sin este try, la promesa rechazada quedaba sin manejar.
  try {
    if (window.localStorage.getItem(GUEST_SAVINGS_MIGRATED_KEY) === userId) return;
  } catch {
    return;
  }

  const entries = loadGuestEntries();
  if (entries.length === 0) {
    try {
      window.localStorage.setItem(GUEST_SAVINGS_MIGRATED_KEY, userId);
    } catch {
      // nada que hacer
    }
    return;
  }

  const supabase = createClient();
  const { error } = await supabase.from('savings_log').insert(
    entries.map((e) => ({
      user_id: userId,
      amount: e.amount,
      categories: e.categories || {},
      created_at: e.createdAt,
    }))
  );

  if (!error) {
    try {
      window.localStorage.setItem(GUEST_SAVINGS_MIGRATED_KEY, userId);
    } catch {
      // nada que hacer
    }
    saveGuestEntries([]);
  } else {
    console.error('No se pudo migrar el ahorro de invitado a la cuenta:', error.message);
  }
}

// Trae el historial agrupado por mes, ordenado del más viejo al más nuevo,
// completando con $0 los meses sin registros para que el gráfico no tenga
// huecos raros. Devuelve los últimos `months` meses (incluye el actual).
export async function getMonthlyHistory(userId: string | null, months = 6): Promise<MonthlySaving[]> {
  let entries: SavingEntry[] = [];

  if (!userId) {
    entries = loadGuestEntries();
  } else {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('savings_log')
      .select('amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      entries = data.map((r: { amount: number; created_at: string }) => ({
        amount: r.amount,
        createdAt: r.created_at,
      }));
    }
  }

  const totalsByMonth = new Map<string, number>();
  entries.forEach(({ amount, createdAt }) => {
    const key = monthKey(new Date(createdAt));
    totalsByMonth.set(key, (totalsByMonth.get(key) || 0) + amount);
  });

  const now = new Date();
  const result: MonthlySaving[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    result.push({ month: key, label: monthLabel(d), total: totalsByMonth.get(key) || 0 });
  }
  return result;
}

// Desglose por rubro del ahorro de UN mes (el actual por default), para la
// torta "en qué rubro ahorrás más". Solo suma los registros que tienen
// `categories` guardado — los de antes de este campo no aportan acá, pero sí
// siguen contando en el total de getMonthlyHistory. Ordenado de mayor a
// menor, sin rubros en $0.
export async function getCategoryBreakdown(
  userId: string | null,
  month: string = currentMonthKey()
): Promise<CategorySaving[]> {
  let entries: SavingEntry[] = [];

  if (!userId) {
    entries = loadGuestEntries();
  } else {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('savings_log')
      .select('categories, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      entries = data.map((r: { categories: Record<string, number> | null; created_at: string }) => ({
        amount: 0,
        createdAt: r.created_at,
        categories: r.categories || {},
      }));
    }
  }

  const totalsByCategory = new Map<string, number>();
  entries.forEach(({ createdAt, categories }) => {
    if (!categories || monthKey(new Date(createdAt)) !== month) return;
    Object.entries(categories).forEach(([cat, amount]) => {
      if (!amount) return;
      totalsByCategory.set(cat, (totalsByCategory.get(cat) || 0) + amount);
    });
  });

  return Array.from(totalsByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
