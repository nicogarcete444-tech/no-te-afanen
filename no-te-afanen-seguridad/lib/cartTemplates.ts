import { StoredCart } from './cart';

// "Changuito habitual": guardar el carrito actual con un nombre para volver
// a cargarlo después (la compra típica del mes, la lista del asado, etc.)
// sin tener que re-buscar cada producto de nuevo.
//
// Va en localStorage, no en Supabase: así funciona YA, para cualquiera
// (con cuenta o invitado), sin depender de una migración de base de datos
// que alguien tenga que acordarse de correr. La contra es que las
// plantillas quedan atadas a este dispositivo/navegador — es un trade-off
// consciente a favor de que la función ande sí o sí desde el primer uso.

export type CartTemplate = {
  id: string;
  name: string;
  createdAt: number;
  cart: StoredCart;
};

const KEY = 'noteafanen_cart_templates';
// Tope prudente: son changuitos guardados, no un historial infinito. Si
// alguien llega a 20, lo más probable es que esté guardando pruebas sueltas
// y no listas que realmente vaya a reusar.
const MAX_TEMPLATES = 20;

function readAll(): CartTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CartTemplate =>
        t && typeof t.id === 'string' && typeof t.name === 'string' && t.cart && typeof t.cart === 'object'
    );
  } catch {
    return [];
  }
}

function writeAll(list: CartTemplate[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES)));
    return true;
  } catch {
    // Storage lleno o bloqueado: la plantilla no queda guardada, pero no
    // rompemos el resto de la app por eso.
    return false;
  }
}

export function listTemplates(): CartTemplate[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveTemplate(name: string, cart: StoredCart): CartTemplate | null {
  const trimmed = name.trim();
  if (!trimmed || !Object.keys(cart.items).some((id) => cart.items[id] > 0)) return null;

  const tpl: CartTemplate = {
    id: 'tpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: trimmed,
    createdAt: Date.now(),
    cart,
  };
  const ok = writeAll([tpl, ...readAll()]);
  return ok ? tpl : null;
}

export function deleteTemplate(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
