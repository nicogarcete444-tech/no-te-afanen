import { fmt } from '@/lib/products';
import StoreLogo, { chainLabel, getStoreLogo } from './StoreLogo';

export type TotalRow = {
  key: string | number;
  chain: string;
  total: number;
  // Marcado por VALOR, no por posición: si dos o más súpers empatan en el
  // total más bajo, todos se marcan — no solo el primero. Así nadie parece
  // "el elegido" cuando en realidad hay un empate.
  isBest: boolean;
  // Cuánto más sale que el más barato (0 en el más barato).
  diff: number;
  // El total se completó con promedios (falta el precio confirmado de algún producto).
  estimated: boolean;
};

// Filas de "Dónde conviene hoy": logo, nombre, barra y total de cada súper.
// Se usan adentro de una .dc-card, tanto para la comparación del carrito como
// para la comparación general (carrito vacío).
export default function StoreTotalRows({ rows, maxTotal }: { rows: TotalRow[]; maxTotal: number }) {
  return (
    <>
      {rows.map((row) => (
        <div className="dc-row" key={row.key}>
          <span className="dc-logo">
            {getStoreLogo(row.chain) ? (
              <StoreLogo chain={row.chain} size={26} />
            ) : (
              <span className="dc-logo-letter">{row.chain.charAt(0).toUpperCase()}</span>
            )}
          </span>
          <div className="dc-mid">
            <div className="dc-name-line">
              <span className="dc-name">{chainLabel(row.chain)}</span>
              {row.isBest && <span className="dc-best">Más barato</span>}
              {row.estimated && <span className="dc-est">Estimado</span>}
            </div>
            <div className="dc-track">
              {/* El ancho va inline y el llenado es una animación CSS de
                  entrada: antes se seteaba desde un efecto que solo corría si
                  cambiaba el total, y las barras quedaban vacías si el
                  desglose se revelaba sin cambios. */}
              <div
                className={`dc-fill${row.isBest ? ' best' : ''}`}
                style={{ width: `${maxTotal ? Math.min(100, Math.round((row.total / maxTotal) * 100)) : 0}%` }}
              />
            </div>
          </div>
          <div className="dc-amt">
            <span className="dc-amt-total">{fmt(row.total)}</span>
            {!row.isBest && row.diff > 0 && <span className="dc-amt-diff">+{fmt(row.diff)}</span>}
          </div>
        </div>
      ))}
    </>
  );
}
