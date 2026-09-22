'use client';

import { SortOrder } from '@/lib/liveItems';
import SortMenu from './SortMenu';
import CategoryIcon from './CategoryIcon';

// Fila de filtros de abajo de "Catálogo": Todos · Bajaron · un rubro por
// cada uno que hay en la lista · Filtro (orden). Se desliza hacia los
// costados. Filtra lo que ya está cargado en pantalla; no vuelve a pedir
// nada a la red (para eso están los rubros redondos de más arriba).
export default function CatalogFilters({
  active,
  onChange,
  categories,
  showDrops,
  sortOrder,
  onSortChange,
}: {
  // 'todos', 'bajaron' o el nombre de un rubro.
  active: string;
  onChange: (f: string) => void;
  categories: string[];
  // "Bajaron" solo tiene sentido en el catálogo (no en resultados de
  // búsqueda): se apoya en las ofertas activas que ya se encontraron.
  showDrops: boolean;
  sortOrder: SortOrder;
  onSortChange: (v: SortOrder) => void;
}) {
  return (
    <div className="filter-row" role="group" aria-label="Filtros del catálogo">
      <button
        type="button"
        className={`filter-pill${active === 'todos' ? ' active' : ''}`}
        aria-pressed={active === 'todos'}
        onClick={() => onChange('todos')}
      >
        Todos
      </button>

      {showDrops && (
        <button
          type="button"
          className={`filter-pill${active === 'bajaron' ? ' active' : ''}`}
          aria-pressed={active === 'bajaron'}
          onClick={() => onChange('bajaron')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7l7 7 4-4 7 7" />
            <path d="M15 17h6v-6" />
          </svg>
          Bajaron
        </button>
      )}

      {categories.map((c) => (
        <button
          key={c}
          type="button"
          className={`filter-pill${active === c ? ' active' : ''}`}
          aria-pressed={active === c}
          onClick={() => onChange(c)}
        >
          <CategoryIcon category={c} />
          {c}
        </button>
      ))}

      <SortMenu value={sortOrder} onChange={onSortChange} />
    </div>
  );
}
