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
import { fetchStorePriceDetails } from '@/lib/storePrices';
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

// Agregar al carrito desde la fila, sin abrir la ficha.
//
// Hasta acá el único camino para sumar un producto era: tocar la fila,
// esperar a que la ficha cargara los precios de las 4 cadenas, tocar
// "Agregar", volver. Para armar una lista de 15 productos eso son 45 toques
// y 15 esperas. Ahora la ficha queda para cuando querés ver el desglose por
// súper, y armar el carrito es un toque por producto.
//
// En este botón vivía antes la campanita de "seguir este producto". Se fue
// a la ficha (donde ya estaba, duplicada): seguir un precio es algo que se
// hace con un producto puntual que te importa, no algo que necesites a mano
// en cada una de las cincuenta filas de un rubro.
function AddButton({
  inCart,
  busy,
  onToggle,
}: {
  inCart: boolean;
  busy: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`cat-row-add${inCart ? ' in-cart' : ''}${busy ? ' busy' : ''}`}
      aria-label={inCart ? 'Quitar del carrito' : 'Agregar al carrito'}
      aria-pressed={inCart}
      disabled={busy}
      onClick={onToggle}
    >
      {busy ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      ) : inCart ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
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
  adding,
  onToggleCart,
}: {
  marca?: string;
  nombre: string;
  presentacion?: string;
  ean: string | null;
  precio: number;
  last: boolean;
  isSelected: boolean;
  onClick: () => void;
  adding: boolean;
  onToggleCart: () => void;
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
      <AddButton
        inCart={isSelected}
        busy={adding}
        onToggle={(e) => {
          // stopPropagation: si no, el mismo toque abre además la ficha del
          // producto encima del carrito recién modificado.
          e.stopPropagation();
          onToggleCart();
        }}
      />
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
  // Qué fila está pidiendo precios ahora mismo (el "+" gira mientras tanto).
  const [addingId, setAddingId] = useState<string | null>(null);

  // Agregar desde la fila: primero traemos el precio real por cadena (el
  // mismo fetchStorePriceDetails que usa la ficha, con su caché de 30
  // minutos, así que si ya abriste ese producto no hay espera), y recién
  // con esos números lo metemos al carrito. Sin esto, el producto entraría
  // sin precios y la comparación por súper lo dejaría afuera.
  //
  // Sacarlo del carrito no pide nada a la red: es inmediato.
  async function handleQuickToggle(
    id: string,
    displayName: string,
    category: string,
    ean: string | null
  ) {
    if (addingId) return;

    if (selected[id]) {
      onToggle(id, { name: displayName, category, prices: {}, ean, icon: '' });
      return;
    }

    setAddingId(id);
    try {
      const details = ean && stores.length ? await fetchStorePriceDetails(ean, stores) : null;
      const priceByStore: Record<string, number> = {};
      if (details) {
        Object.entries(details).forEach(([chain, detail]) => {
          if (detail?.precio) priceByStore[chain] = detail.precio;
        });
      }
      onToggle(id, {
        name: displayName,
        category,
        prices: priceByStore,
        ean,
        pricedAt: Date.now(),
        icon: '',
      });
    } finally {
      setAddingId(null);
    }
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
                    adding={addingId === id}
                    onToggleCart={() => handleQuickToggle(id, displayName, cat, ean)}
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
