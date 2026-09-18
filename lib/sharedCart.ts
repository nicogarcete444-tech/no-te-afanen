import { CartMap } from './types';

// Carrito compartido por LINK, no por base de datos: todo el contenido va
// codificado en la URL (?carrito=...). Fue eso o sumar una tabla nueva en
// Supabase + tiempo real — bastante más trabajo, y sobre todo, algo que
// depende de que el usuario corra una migración que se puede llegar a
// olvidar. Con el link, la función anda para cualquiera desde el primer
// deploy, sin pasos extra.
//
// A cambio, esto es "mandame lo que tenés ahora", no un carrito en vivo que
// se sincroniza solo: quien lo recibe ve un cartel para sumar esos
// productos a SU carrito (se abre con la misma lógica que ya existe para
// cargar un changuito guardado), no una edición compartida en tiempo real.

export type SharedCartProduct = { name: string; category: string; ean?: string | null };

export type SharedCartPayload = {
  items: CartMap;
  products: Record<string, SharedCartProduct>;
};

const PARAM = 'carrito';

// Tope de productos por link: una URL con muchísimos productos queda
// kilométrica, y WhatsApp/Telegram a veces truncan o rompen links así de
// largos. Mejor un link corto que siempre llega entero.
const MAX_SHARED_ITEMS = 30;

function toBase64Url(json: string): string {
  // btoa no entiende UTF-8 directo (tildes, ñ) — hay que pasar por
  // encodeURIComponent/unescape primero para no romper el decode del otro
  // lado. Después, +/= no son seguros en una URL sin escapar, así que se
  // reemplazan por variantes "url-safe".
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function buildShareUrl(
  items: CartMap,
  productIndex: Record<string, SharedCartProduct>
): string | null {
  if (typeof window === 'undefined') return null;

  const ids = Object.keys(items)
    .filter((id) => items[id] > 0 && productIndex[id])
    .slice(0, MAX_SHARED_ITEMS);
  if (!ids.length) return null;

  const payload: SharedCartPayload = { items: {}, products: {} };
  ids.forEach((id) => {
    payload.items[id] = items[id];
    const p = productIndex[id];
    payload.products[id] = { name: p.name, category: p.category, ean: p.ean };
  });

  try {
    const encoded = toBase64Url(JSON.stringify(payload));
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set(PARAM, encoded);
    return url.toString();
  } catch {
    return null;
  }
}

function isValidPayload(v: any): v is SharedCartPayload {
  return (
    v &&
    typeof v === 'object' &&
    v.items &&
    typeof v.items === 'object' &&
    v.products &&
    typeof v.products === 'object'
  );
}

export function readSharedCartFromUrl(): SharedCartPayload | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(PARAM);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    return isValidPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Saca el "?carrito=..." de la URL sin recargar la página, para que no
// vuelva a aparecer el cartel de "sumar al carrito" si la persona refresca
// o navega para atrás.
export function clearSharedCartFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, '', url.toString());
}
