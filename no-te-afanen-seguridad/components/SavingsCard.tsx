import { fmt } from '@/lib/products';

// La tarjeta de ahorro: el hero de la portada.
//
// El fondo es public/hero-cart.webp (un carrito 3D violeta sobre violeta
// liso). Todo el espacio vacío está a la izquierda, así que el texto se
// apoya ahí y el carrito queda a la derecha sin que se pisen. La imagen y
// el velo de contraste viven en CSS (ver .savings-card en globals.css); acá
// solo está el contenido.
//
// Tiene dos estados, porque no son la misma pantalla:
//   - Sin ahorro todavía (recién instalada): versión más baja. Un "$ 0"
//     enorme ocupando la portada es el peor recibimiento posible, y encima
//     empuja los productos abajo del pliegue.
//   - Con ahorro registrado: versión completa, el número grande. Ahí sí es
//     la mejor noticia que la app tiene para dar.
export default function SavingsCard({
  savings,
  onOpenHistory,
}: {
  savings: number;
  onOpenHistory?: () => void;
}) {
  const empty = savings <= 0;

  return (
    <div className={`savings-card${empty ? ' is-empty' : ''}`}>
      <div className="savings-copy">
        <div className="savings-label">Ahorrá este mes</div>
        <div className="savings-amount">{fmt(savings)}</div>
        <div className="savings-detail">
          {savings > 0
            ? 'Sumado de cada lista de compras que confirmaste este mes.'
            : 'Armá tu carrito, compará y confirmá la lista: el ahorro se suma acá.'}
        </div>
      </div>

      {onOpenHistory && (
        <button type="button" className="savings-cta" onClick={onOpenHistory}>
          Ver mis compras
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
