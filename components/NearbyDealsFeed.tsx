'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/products';
import { getProductImageUrl } from '@/lib/productImage';
import { findNearbyDeals, NearbyDeal } from '@/lib/nearbyDeals';
import { getInitials, getMonogramIndex } from '@/lib/monogram';
import { LiveItem } from '@/lib/liveItems';
import { NearbyStore } from '@/lib/storePrices';
import { CartMap, Product } from '@/lib/types';
import StoreLogo from './StoreLogo';
import ProductDetailSheet, { ProductDetailInfo } from './ProductDetailSheet';

// Misma lógica que CatRowMedia (CategoryProductList.tsx): busca la foto real
// del producto por EAN y, mientras no hay nada, muestra el monograma de
// respaldo (iniciales sobre un color) en vez de dejar el hueco vacío.
function DealMedia({ ean, nombre }: { ean: string; nombre: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
      <div className="deal-card-media has-photo">
        <img src={url} alt="" width={64} height={64} loading="lazy" decoding="async" onError={() => setUrl(null)} />
      </div>
    );
  }

  return (
    <div className={`deal-card-media${buscando ? ' loading' : ' no-photo'}`}>
      {!buscando && (
        <div className="monogram monogram-lg" data-mi={getMonogramIndex(nombre)}>
          {getInitials(nombre)}
        </div>
      )}
    </div>
  );
}

export default function NearbyDealsFeed({
  pool,
  stores,
  selected,
  onToggle,
  userId,
  premium,
}: {
  // Productos ya traídos (vidriera / catálogo) entre los que buscar ofertas.
  pool: LiveItem[];
  stores: NearbyStore[];
  selected: CartMap;
  onToggle: (id: string, product: Product) => void;
  userId: string | null;
  premium: boolean;
}) {
  const [deals, setDeals] = useState<NearbyDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [openProduct, setOpenProduct] = useState<ProductDetailInfo | null>(null);

  useEffect(() => {
    if (!stores.length || !pool.length) return;
    let cancelled = false;
    setLoading(true);
    findNearbyDeals(pool, stores)
      .then((found) => {
        if (cancelled) return;
        setDeals(found);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // Solo se vuelve a calcular si cambian las cadenas cercanas o el pool de
    // productos disponible (nuevo rubro, más resultados cargados) — no en
    // cada tecla que se escribe en la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, pool.length]);

  function handleToggleCart(priceByStore: Record<string, number>) {
    if (!openProduct) return;
    onToggle(openProduct.id, {
      name: openProduct.displayName,
      category: openProduct.category,
      prices: priceByStore,
      ean: openProduct.ean,
      pricedAt: Date.now(),
      icon: '',
    });
    setOpenProduct(null);
  }

  // Todavía no sabemos si hay ofertas (esperando ubicación/catálogo): no
  // mostramos nada para no ocupar lugar con un cartel vacío.
  if (!stores.length || !pool.length) return null;
  if (checked && !loading && deals.length === 0) return null;

  return (
    <div className="deals-feed">
      <div className="deals-feed-head">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
        </svg>
        <h2>Ofertas cerca tuyo</h2>
        <button
          type="button"
          className="deals-feed-see-all"
          onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Ver todo
        </button>
      </div>
      <div className="deals-feed-scroll">
        {loading && !deals.length
          ? Array.from({ length: 3 }).map((_, i) => <div className="deal-card skeleton-card" key={i} />)
          : deals.map((deal) => (
              <button
                key={deal.id}
                className="deal-card"
                onClick={() =>
                  setOpenProduct({
                    id: 'live:' + deal.ean,
                    displayName: deal.nombre,
                    category: deal.category || 'Otros',
                    ean: deal.ean,
                    presentacion: deal.presentacion,
                  })
                }
              >
                <span className="deal-card-badge">{deal.discountPct}% OFF</span>
                <DealMedia ean={deal.ean} nombre={deal.nombre} />
                <StoreLogo chain={deal.chain} size={16} className="deal-card-logo" />
                {deal.marca && <span className="deal-card-brand">{deal.marca}</span>}
                <span className="deal-card-name">{deal.nombre}</span>
                <span className="deal-card-prices">
                  <span className="deal-card-old">{fmt(deal.precioLista)}</span>
                  <span className="deal-card-now">{fmt(deal.precio)}</span>
                </span>
              </button>
            ))}
      </div>

      <ProductDetailSheet
        open={!!openProduct}
        product={openProduct}
        stores={stores}
        isSelected={!!openProduct && !!selected[openProduct.id]}
        userId={userId}
        premium={premium}
        onClose={() => setOpenProduct(null)}
        onToggleCart={handleToggleCart}
      />
    </div>
  );
}
