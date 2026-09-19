import { fmt } from '@/lib/products';

// La tarjeta de ahorro.
//
// Antes era una foto de stock de un carrito de supermercado con un degradé
// violeta encima y el texto peleando por contraste contra las bolsas del
// fondo (de ahí los tres text-shadow y el overlay al 72% que había que ir
// corriendo cada vez que el texto crecía). Es exactamente el recurso que
// hace que una app se vea comprada hecha: cualquier comparador de precios
// del mundo puede tener esa misma foto.
//
// Ahora la forma la hace la app: un ticket de súper, con el borde inferior
// picado, el número del ahorro como protagonista y el violeta de marca como
// acento y no como fondo. Es dibujo, no fotografía — no depende de ningún
// asset, pesa cero, y se ve igual de nítido en cualquier pantalla.
//
// Además tiene dos estados, porque no son la misma pantalla:
//   - Sin ahorro todavía (recién instalada): versión compacta. Un "$ 0" de
//     38px ocupando el primer tercio de la portada es el peor recibimiento
//     posible, y encima empuja los productos abajo del pliegue.
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
