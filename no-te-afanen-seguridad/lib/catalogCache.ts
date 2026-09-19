// Guarda en localStorage el último catálogo que sí pudimos traer de Precios
// Claros, para poder mostrar "algo" (con aviso de desactualizado) el día que
// la API del gobierno esté caída o bloqueando pedidos, en vez de una
// pantalla vacía.
//
// Se cachea por categoría (incluida "Todos") porque cada una dispara un set
// de búsquedas distinto.

import { LiveItem } from '@/lib/liveItems';

const PREFIX = 'nta_catalog_cache_v1:';

type CachedCatalog = {
  items: LiveItem[];
  savedAt: number; // Date.now()
};

function keyFor(category: string): string {
  return PREFIX + category;
}

export function saveCatalogCache(category: string, items: LiveItem[]): void {
  if (typeof window === 'undefined' || !items.length) return;
  try {
    const payload: CachedCatalog = { items, savedAt: Date.now() };
    window.localStorage.setItem(keyFor(category), JSON.stringify(payload));
  } catch {
    // localStorage lleno o deshabilitado (modo privado, etc.): no es crítico,
    // simplemente no vamos a tener fallback esta vez.
  }
}

export function loadCatalogCache(category: string): CachedCatalog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(category));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Texto corto tipo "hace 3 horas" / "ayer" / "el 12/09" para mostrar junto
// al aviso de catálogo desactualizado.
export function formatCacheAge(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  const date = new Date(savedAt);
  return `el ${date.toLocaleDateString('es-AR')}`;
}
