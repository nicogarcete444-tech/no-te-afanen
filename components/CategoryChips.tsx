import { CATEGORIES } from '@/lib/products';

// Los chips de rubros son solo texto (sin iconito): los dibujos se sacaron por
// estética. El estilo de la píldora está en .chip de globals.css.
export default function CategoryChips({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    // Los chips eran <div onClick>: no se podían tabular ni activar con
    // Enter, y un lector de pantalla los leía como texto suelto. Como
    // <button> se comportan como lo que son y además avisan cuál está
    // elegido (aria-pressed).
    <div className="chip-row" role="group" aria-label="Rubros">
      {CATEGORIES.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            type="button"
            className={`chip${isActive ? ' active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onSelect(c)}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
