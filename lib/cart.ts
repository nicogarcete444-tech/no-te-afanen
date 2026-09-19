import { createClient } from '@/lib/supabase/client';
import { CartMap, Product } from './types';

// Los carritos guardados antes del cambio traen `prices` como un array
// alineado por posición con la lista de súpers cercanos de ESE momento. Esa
// alineación no se puede reconstruir después (dependía de dónde estaba parada
// la persona ese día), así que esos precios se descartan: el producto queda
// en el carrito sin precio y se vuelve a pedir el actual la próxima vez que
// se compara. Es preferible eso a mostrar el precio de Coto como si fuera el
// de Carrefour.
function normalizeProduct(raw: any): Product {
  const prices =
    raw?.prices && !Array.isArray(raw.prices) && typeof raw.prices === 'object' ? raw.prices : {};
  return {
    name: raw?.name ?? 'Producto',
    category: raw?.category ?? 'Precios Claros',
    prices,
    ean: raw?.ean ?? null,
    pricedAt: typeof raw?.pricedAt === 'number' ? raw.pricedAt : undefined,
    icon: raw?.icon ?? '',
  };
}

function normalizeProducts(raw: any): Record<string, Product> {
  const out: Record<string, Product> = {};
  Object.entries(raw || {}).forEach(([id, value]) => {
    out[id] = normalizeProduct(value);
  });
  return out;
}

export type StoredCart = {
  items: CartMap;
  // Productos que no vienen del catálogo fijo (agregados desde la búsqueda
  // en vivo de Precios Claros). Se guardan acá para poder mostrarlos de
  // nuevo al recargar la página o entrar desde otro celu, ya que no existen
  // en lib/products.ts.
  liveProducts: Record<string, Product>;
};

export const EMPTY_CART: StoredCart = { items: {}, liveProducts: {} };

// Carrito de invitado (sin cuenta): se guarda en localStorage, solo en este
// dispositivo/navegador. Si después crea una cuenta, se puede seguir usando
// tal cual sin perder nada mientras no borre datos del navegador.
const GUEST_CART_KEY = 'noteafanen_guest_cart';

function loadGuestCart(): StoredCart {
  if (typeof window === 'undefined') return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw);
    return {
      items: parsed.items || {},
      liveProducts: normalizeProducts(parsed.liveProducts),
    };
  } catch {
    return EMPTY_CART;
  }
}

function saveGuestCart(cart: StoredCart): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    return true;
  } catch {
    return false;
  }
}

// Trae el carrito guardado. Si userId es null (invitado, sin cuenta), lo lee
// de localStorage. Si hay usuario logueado, lo lee de Supabase; si todavía
// no tiene fila en `carts` (usuario nuevo), devuelve el carrito vacío sin
// error.
export async function loadCart(userId: string | null): Promise<StoredCart> {
  if (!userId) return loadGuestCart();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('carts')
    .select('items, live_products')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return EMPTY_CART;

  return {
    items: (data.items as CartMap) || {},
    liveProducts: normalizeProducts(data.live_products),
  };
}

// Guarda el carrito completo. En modo invitado, a localStorage (siempre
// "exitoso" salvo que el navegador bloquee el storage). Con usuario logueado,
// hace upsert en Supabase. Se llama con debounce desde StoreApp cada vez que
// cambian las cantidades, así que no hace falta mergear acá: siempre
// mandamos el estado completo actual.
export async function saveCart(userId: string | null, cart: StoredCart): Promise<boolean> {
  if (!userId) return saveGuestCart(cart);

  const supabase = createClient();
  const { error } = await supabase.from('carts').upsert({
    user_id: userId,
    items: cart.items,
    live_products: cart.liveProducts,
    updated_at: new Date().toISOString(),
  });

  return !error;
}
