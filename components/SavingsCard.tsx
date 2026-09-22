import type { ReactNode } from 'react';
import { fmt } from '@/lib/products';
import StoreLogo, { chainLabel } from './StoreLogo';

// La tarjeta de ahorro: el hero de la portada.
//
// El fondo es public/hero-cart.webp (un carrito 3D violeta sobre violeta
// liso). Todo el espacio vacío está a la izquierda, así que el texto se
// apoya ahí y el carrito queda a la derecha sin que se pisen. Formato
// apaisado y bajo, con bordes redondeados (sin el picado de ticket). La
// imagen y el velo de contraste viven en CSS (ver .savings-card en
// globals.css); acá solo está el contenido.
//
// Tiene dos estados, porque no son la misma pantalla:
//   - Sin ahorro todavía (recién instalada): versión más baja. Un "$ 0"
//     enorme ocupando la portada es el peor recibimiento posible, y encima
//     empuja los productos abajo del pliegue.
//   - Con ahorro registrado: versión completa, el número grande. Ahí sí es
//     la mejor noticia que la app tiene para dar.
// Estado del hero cuando HAY productos en el carrito. Con el carrito vacío no
// se usa: la portada queda igual que siempre (ahorro del mes).
export type CartHero = {
  // Cantidad de productos distintos que hay en el carrito.
  count: number;
  // El desglose por súper ya está desbloqueado (premium, o free que ya gastó
  // una comparación en este carrito). Si es false NO mostramos el veredicto:
  // es justo lo que el plan free desbloquea con "Comparar ahora".
  revealed: boolean;
  // Mismo cálculo y mismo orden que "Comparación por súper". Null mientras
  // no haya ningún súper con precio de algo del carrito.
  verdict: {
    chain: string;
    // Cuánto más sale el súper más caro que el más barato. 0 = empatan.
    diff: number;
    worstChain: string | null;
    // El total del súper ganador se completó con promedios (falta el precio
    // confirmado de algún producto).
    estimated: boolean;
  } | null;
  onCta: () => void;
};

const shortChain = chainLabel;

function CartHeroCard({ cart }: { cart: CartHero }) {
  const { count, revealed, verdict, onCta } = cart;
  const label = `Tu canasta de ${count} producto${count === 1 ? '' : 's'}`;

  let title: ReactNode;
  let detail: string;
  const single = !!verdict && verdict.worstChain === null;
  const tie = !!verdict && !single && verdict.diff <= 0;

  if (!revealed) {
    title = 'Tu carrito está listo';
    detail = 'Compará y mirá en qué súper te conviene comprarlo.';
  } else if (!verdict) {
    title = 'Buscando precios';
    detail = 'Cuando lleguen los precios de tu carrito, acá ves qué súper conviene.';
  } else if (tie) {
    title = 'Precios parejos';
    detail = 'Tu carrito sale lo mismo en las cadenas cercanas.';
  } else {
    // El súper va con su logo, en una segunda línea. Va dentro de una caja
    // blanca (la que ya arma StoreLogo) porque los logos, sueltos, se pierden
    // sobre el violeta del hero. Si la cadena no tiene logo cargado, StoreLogo
    // cae al nombre en texto.
    title = (
      <>
        <span className="savings-verdict-line">Hoy conviene</span>
        <span className="savings-verdict-line savings-verdict-logo">
          <StoreLogo chain={verdict.chain} size={30} />
        </span>
      </>
    );
    detail = single
      ? 'Es la única cadena cercana con precios de tu carrito.'
      : `Pagás hasta ${fmt(verdict.diff)} menos que en ${shortChain(verdict.worstChain as string)}${verdict.estimated ? ' (estimado)' : ''}.`;
  }

  return (
    <div className="savings-card is-cart">
      <div className="savings-copy">
        <div className="savings-label">{label}</div>
        <div className="savings-verdict-title">{title}</div>
        <div className="savings-detail">{detail}</div>
      </div>

      <button type="button" className="savings-cta" onClick={onCta}>
        {revealed ? 'Ver comparación' : 'Comparar ahora'}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

export default function SavingsCard({
  savings,
  onOpenHistory,
  cart,
}: {
  savings: number;
  onOpenHistory?: () => void;
  // Solo se pasa cuando hay productos en el carrito.
  cart?: CartHero | null;
}) {
  if (cart && cart.count > 0) return <CartHeroCard cart={cart} />;

  const empty = savings <= 0;

  return (
    <div className={`savings-card${empty ? ' is-empty' : ''}`}>
      <div className="savings-copy">
        <div className="savings-label">Ahorrá este mes</div>
        <div className="savings-amount">{fmt(savings)}</div>
        <div className="savings-detail">
          {savings > 0
            ? 'De tus listas confirmadas este mes.'
            : 'Armá tu carrito y confirmá la lista: el ahorro se suma acá.'}
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
