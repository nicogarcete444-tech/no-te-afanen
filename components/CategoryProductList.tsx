'use client';

import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_COLORS, fmt } from '@/lib/products';
import { getProductImageUrl } from '@/lib/productImage';
import { NearbyStore } from '@/lib/storePrices';
import { CartMap, Product } from '@/lib/types';
import {
  LiveItem,
  SortOrder,
  cartIdFor,
  displayNameFor,
  extractEan,
  groupLiveItems,
  sortGroups,
} from '@/lib/liveItems';
import { computeUnitPrice } from '@/lib/unitPrice';
import { FREE_ALERT_LIMIT, getWatchedCount, getWatchedEans, toggleWatch } from '@/lib/priceAlerts';
import ProductDetailSheet, { ProductDetailInfo } from './ProductDetailSheet';

const FALLBACK_ICON_PATH =
  'M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2';

function CatRowMedia({ ean, nombre }: { ean: string | null; nombre: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // "buscando" arranca en true solo si hay un código con el que buscar. Sin
  // este estado, el hueco mostraba el ícono gris de respaldo desde el primer
  // frame y parecía que el producto no tenía foto, cuando en realidad todavía
  // no había llegado.
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
      <div className="cat-row-media has-photo">
        <img src={url} alt="" width={54} height={54} loading="lazy" decoding="async" onError={() => setUrl(null)} />
      </div>
    );
  }

  return (
    <div className={`cat-row-media${buscando ? ' loading' : ' no-photo'}`}>
      {!buscando && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d={FALLBACK_ICON_PATH} />
          <circle cx="9.5" cy="19" r="1.3" />
          <circle cx="16.5" cy="19" r="1.3" />
        </svg>
      )}
    </div>
  );
}

function FollowButton({
  watching,
  onToggle,
}: {
  watching: boolean;
  onToggle: (e: { stopPropagation: () => void }) => void;
}) {
  return (
    <button
      className={`cat-row-follow${watching ? ' active' : ''}`}
      onClick={onToggle}
      title={watching ? 'Dejar de seguir este precio' : 'Seguir este precio (avisamos si sube o baja)'}
      aria-label={watching ? 'Dejar de seguir' : 'Seguir'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={watching ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 4.5-1.5 6-2 7h16c-.5-1-2-2.5-2-7Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
    </button>
  );
}

function CatRow({
  marca,
  nombre,
  presentacion,
  ean,
  precio,
  last,
  isSelected,
  onClick,
  showFollow,
  watching,
  onToggleFollow,
}: {
  marca?: string;
  nombre: string;
  presentacion?: string;
  ean: string | null;
  precio: number;
  last: boolean;
  isSelected: boolean;
  onClick: () => void;
  showFollow: boolean;
  watching: boolean;
  onToggleFollow: () => void;
}) {
  const metaParts = [presentacion, ean ? `Cód. ${ean}` : null].filter(Boolean);
  // "Desde" el precio más bajo a nivel país (ver comentario abajo): el
  // precio por unidad se calcula sobre ese mismo número para ser
  // consistente con lo que se muestra al lado.
  const unitPrice = computeUnitPrice(precio, presentacion);

  return (
    <div
      className={`cat-row${last ? ' last' : ''}${isSelected ? ' selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      <CatRowMedia ean={ean} nombre={nombre} />
      <div className="cat-row-info">
        {marca && <div className="cat-row-brand">{marca}</div>}
        <div className="cat-row-name">{nombre}</div>
        {!!metaParts.length && <div className="cat-row-meta">{metaParts.join(' · ')}</div>}
      </div>
      {/* "Desde" y no "$X" a secas: este número es el precio más bajo que
          Precios Claros informa para el producto en CUALQUIER sucursal del
          país, no necesariamente el de un súper cerca tuyo. El precio por
          cadena real aparece al abrir la ficha. */}
      <div className="cat-row-price">
        {precio ? <span className="cat-row-price-from">desde</span> : null}
        <span className="cat-row-price-val">{precio ? fmt(precio) : 's/d'}</span>
        {unitPrice && <span className="cat-row-price-unit">{unitPrice.label}</span>}
      </div>
      {showFollow && ean && (
        <FollowButton
          watching={watching}
          onToggle={(e) => {
            e.stopPropagation();
            onToggleFollow();
          }}
        />
      )}
    </div>
  );
}

export default function CategoryProductList({
  items,
  stores,
  selected,
  onToggle,
  userId,
  premium,
  sortOrder = 'relevancia',
}: {
  items: LiveItem[];
  stores: NearbyStore[];
  selected: CartMap;
  onToggle: (id: string, product: Product) => void;
  userId: string | null;
  premium: boolean;
  sortOrder?: SortOrder;
}) {
  const [openProduct, setOpenProduct] = useState<ProductDetailInfo | null>(null);
  const [watchedEans, setWatchedEans] = useState<Set<string>>(new Set());
  const [alertLimitNotice, setAlertLimitNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setWatchedEans(new Set());
      return;
    }
    let cancelled = false;
    getWatchedEans(userId).then((eans) => {
      if (!cancelled) setWatchedEans(eans);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!alertLimitNotice) return;
    const t = setTimeout(() => setAlertLimitNotice(null), 4000);
    return () => clearTimeout(t);
  }, [alertLimitNotice]);

  async function handleToggleFollow(ean: string, nombre: string) {
    if (!userId) return;
    const currentlyWatching = watchedEans.has(ean);
    // El tope de free solo frena PRENDER un seguimiento nuevo; apagar uno
    // nunca está limitado (mismo criterio que en la ficha del producto).
    if (!currentlyWatching && !premium) {
      const current = await getWatchedCount(userId);
      if (current >= FREE_ALERT_LIMIT) {
        setAlertLimitNotice(
          `Llegaste al tope de ${FREE_ALERT_LIMIT} seguimientos del plan free. Sacá alguno o pasate a premium para seguir sin límite.`
        );
        return;
      }
    }
    const next = await toggleWatch(userId, ean, nombre, currentlyWatching);
    setWatchedEans((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(ean);
      else copy.delete(ean);
      return copy;
    });
  }

  const groupedAll = groupLiveItems(items);

  const byCat = new Map<string, { item: LiveItem; precio: number }[]>();
  groupedAll.forEach((g) => {
    const cat = g.item._cat || 'Otros';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(g);
  });

  const orderedCats = CATEGORIES.filter((c) => c !== 'Todos' && byCat.has(c));
  byCat.forEach((_, cat) => {
    if (!orderedCats.includes(cat)) orderedCats.push(cat);
  });

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

  return (
    <>
      {alertLimitNotice && <div className="cat-alert-limit-notice">{alertLimitNotice}</div>}
      {orderedCats.map((cat) => {
        const group = sortGroups(byCat.get(cat)!, sortOrder);
        const dotColor = (CATEGORY_COLORS[cat] || ['#B9C0BB', '#8B948A'])[1];
        return (
          <div className="cat-section" key={cat}>
            <div className="cat-section-head">
              <span className="cat-dot" style={{ background: dotColor }} />
              <span className="cat-section-name">{cat}</span>
              <span className="cat-section-count">· {group.length}</span>
            </div>
            <div className="cat-section-list">
              {group.map(({ item, precio }, i) => {
                const ean = extractEan(item);
                const id = cartIdFor(item);
                const displayName = displayNameFor(item);
                return (
                  <CatRow
                    key={id}
                    marca={item.marca}
                    nombre={item.nombre?.trim() || item.presentacion?.trim() || item.marca || 'Producto'}
                    presentacion={item.presentacion}
                    ean={ean}
                    precio={precio}
                    last={i === group.length - 1}
                    isSelected={!!selected[id]}
                    onClick={() =>
                      setOpenProduct({ id, displayName, category: cat, ean, presentacion: item.presentacion })
                    }
                    showFollow={!!userId}
                    watching={!!ean && watchedEans.has(ean)}
                    onToggleFollow={() => ean && handleToggleFollow(ean, displayName)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

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
    </>
  );
}
