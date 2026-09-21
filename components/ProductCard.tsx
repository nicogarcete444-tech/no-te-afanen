'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt } from '@/lib/products';
import { getProductImageUrl } from '@/lib/productImage';
import { getInitials, getMonogramIndex } from '@/lib/monogram';
import { fetchStorePriceDetails, NearbyStore, StorePriceDetail } from '@/lib/storePrices';
import StoreLogo, { chainLabel, getStoreLogo } from './StoreLogo';

// La tarjeta de producto del catálogo.
//
// Antes cada producto era una fila con un solo número: "desde $X", que es el
// precio más bajo de Precios Claros en CUALQUIER sucursal del país. Ahora cada
// tarjeta muestra lo que la gente viene a mirar: cuánto sale en los súpers de
// al lado, los tres más baratos, y cuánto se ahorra. Esos precios se piden
// recién cuando la tarjeta está por entrar en pantalla (ver useCardPrices) y
// comparten el caché de la ficha y del feed de ofertas, así que un producto
// nunca se pide dos veces.

function CardMedia({ ean, nombre, initialsFrom }: { ean: string | null; nombre: string; initialsFrom: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // "buscando" arranca en true solo si hay un código con el que buscar: sin
  // esto el hueco mostraba el respaldo desde el primer frame y parecía que el
  // producto no tenía foto, cuando todavía no había llegado.
  const [buscando, setBuscando] = useState(!!ean);

  useEffect(() => {
    let cancelled = false;
    if (!ean) {
      setBuscando(false);
      return;
    }
    setBuscando(true);
    getProductImageUrl(ean, nombre).then((found) => {
      if (cancelled) return;
      setUrl(found);
      setBuscando(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ean, nombre]);

  if (url) {
    return (
      <div className="pcard-media has-photo">
        <img src={url} alt="" width={60} height={60} loading="lazy" decoding="async" onError={() => setUrl(null)} />
      </div>
    );
  }

  return (
    <div className={`pcard-media${buscando ? ' loading' : ' no-photo'}`}>
      {!buscando && (
        <div className="monogram monogram-md" data-mi={getMonogramIndex(initialsFrom)}>
          {getInitials(initialsFrom)}
        </div>
      )}
    </div>
  );
}

// Cuántos pedidos de precio por cadena hay en vuelo a la vez. Sin tope, bajar
// rápido por un rubro de 80 productos disparaba 80 pedidos juntos contra
// /api/producto (que tiene rate limit por IP).
const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: (() => void)[] = [];

function limited<T>(job: () => Promise<T>, skip: () => boolean): Promise<T | null> {
  return new Promise((resolve) => {
    const run = () => {
      // Si la tarjeta ya se fue de pantalla mientras esperaba turno, no
      // gastamos el pedido.
      if (skip()) {
        resolve(null);
        waiting.shift()?.();
        return;
      }
      inFlight++;
      job()
        .then(resolve, () => resolve(null))
        .finally(() => {
          inFlight--;
          waiting.shift()?.();
        });
    };
    if (inFlight < MAX_IN_FLIGHT) run();
    else waiting.push(run);
  });
}

type CardPrices = { status: 'idle' | 'loading' | 'done'; details: Record<string, StorePriceDetail> | null };

function useCardPrices(ean: string | null, stores: NearbyStore[], ref: React.RefObject<HTMLElement | null>): CardPrices {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<CardPrices>({ status: 'idle', details: null });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '260px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!visible || !ean || !stores.length) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    limited(() => fetchStorePriceDetails(ean, stores), () => cancelled).then((details) => {
      if (!cancelled) setState({ status: 'done', details });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, ean, stores]);

  return state;
}

export type ProductCardProps = {
  title: string;
  subtitle: string;
  initialsFrom: string;
  ean: string | null;
  // Precio más bajo que informa Precios Claros en todo el país: respaldo
  // para cuando no hay precios por cadena.
  fallbackPrice: number;
  stores: NearbyStore[];
  isSelected: boolean;
  adding: boolean;
  watching: boolean;
  onOpen: () => void;
  onToggleCart: () => void;
  onToggleWatch: () => void;
};

export default function ProductCard({
  title,
  subtitle,
  initialsFrom,
  ean,
  fallbackPrice,
  stores,
  isSelected,
  adding,
  watching,
  onOpen,
  onToggleCart,
  onToggleWatch,
}: ProductCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { status, details } = useCardPrices(ean, stores, ref);

  const ranked = details
    ? Object.entries(details)
        .map(([chain, d]) => ({ chain, ...d }))
        .filter((d) => d.precio > 0)
        .sort((a, b) => a.precio - b.precio)
    : [];
  const top = ranked.slice(0, 3);
  const cheapest = ranked[0];
  const priciest = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const saving = cheapest && priciest ? priciest.precio - cheapest.precio : 0;

  // Sin código de barras o sin súpers cerca no hay nada que pedir: se ve solo
  // el respaldo. Con código y súpers, arranca en esqueleto hasta que llegue.
  const canLoad = !!ean && stores.length > 0;
  const showSkeleton = canLoad && status !== 'done';
  const showTiles = status === 'done' && top.length > 0;

  return (
    <div
      ref={ref}
      className={`pcard${isSelected ? ' selected' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="pcard-top">
        <CardMedia ean={ean} nombre={title} initialsFrom={initialsFrom} />
        <div className="pcard-info">
          <div className="pcard-name">{title}</div>
          {subtitle && <div className="pcard-sub">{subtitle}</div>}
        </div>
        <button
          type="button"
          className={`pcard-bell${watching ? ' on' : ''}`}
          aria-label={watching ? 'Dejar de seguir este precio' : 'Seguir este precio'}
          aria-pressed={watching}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatch();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={watching ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>

      {showSkeleton && (
        <div className="pcard-tiles" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="pcard-tile skeleton" key={i} />
          ))}
        </div>
      )}

      {showTiles && (
        <div className="pcard-tiles">
          {top.map((t, i) => (
            <div className={`pcard-tile${i === 0 ? ' best' : ''}`} key={t.chain} title={t.chain}>
              <span className="pcard-tile-logo">
                {getStoreLogo(t.chain) ? (
                  <StoreLogo chain={t.chain} size={24} />
                ) : (
                  <span className="pcard-tile-name">{chainLabel(t.chain)}</span>
                )}
              </span>
              <span className="pcard-tile-price">{fmt(t.precio)}</span>
              {i === 0 && top.length > 1 && <span className="pcard-tile-flag">Más barato</span>}
            </div>
          ))}
        </div>
      )}

      {!showSkeleton && !showTiles && (
        <div className="pcard-from">
          {fallbackPrice ? (
            <>
              Desde <strong>{fmt(fallbackPrice)}</strong> en el país
            </>
          ) : (
            'Sin precio informado'
          )}
        </div>
      )}

      <div className="pcard-foot">
        <div className="pcard-save">
          {showTiles && saving > 0 && priciest ? (
            <>
              Ahorrás <strong>{fmt(saving)}</strong> vs {chainLabel(priciest.chain)}
            </>
          ) : null}
        </div>
        <button
          type="button"
          className={`pcard-add${isSelected ? ' in-cart' : ''}${adding ? ' busy' : ''}`}
          aria-pressed={isSelected}
          disabled={adding}
          onClick={(e) => {
            // stopPropagation: si no, el mismo toque abre además la ficha del
            // producto encima del carrito recién modificado.
            e.stopPropagation();
            onToggleCart();
          }}
        >
          {adding ? 'Agregando…' : isSelected ? 'En tu carrito' : 'Agregar'}
        </button>
      </div>
    </div>
  );
}
