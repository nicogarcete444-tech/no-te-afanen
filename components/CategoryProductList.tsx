'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/products';
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
import { fetchStorePriceDetails } from '@/lib/storePrices';
import { FREE_ALERT_LIMIT, getWatchedCount, getWatchedEans, toggleWatch } from '@/lib/priceAlerts';
import { niceCase } from '@/lib/textCase';
import ProductCard from './ProductCard';
import ProductDetailSheet, { ProductDetailInfo } from './ProductDetailSheet';

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

  // Campanita de cada tarjeta: qué productos sigue esta cuenta. Se trae de una
  // sola vez (un pedido para toda la lista, no uno por tarjeta).
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ text: string; login?: boolean } | null>(null);

  useEffect(() => {
    if (!userId) {
      setWatched(new Set());
      return;
    }
    let cancelled = false;
    getWatchedEans(userId).then((eans) => {
      if (!cancelled) setWatched(eans);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  async function handleToggleWatch(ean: string | null, displayName: string) {
    if (!ean) {
      setNotice({ text: 'Este producto no tiene código de barras, no lo podemos seguir.' });
      return;
    }
    if (!userId) {
      setNotice({ text: 'Creá tu cuenta gratis para que te avisemos cuando cambie el precio.', login: true });
      return;
    }
    const currently = watched.has(ean);
    if (!currently && !premium) {
      const count = await getWatchedCount(userId);
      if (count >= FREE_ALERT_LIMIT) {
        setNotice({
          text: `Llegaste al tope de ${FREE_ALERT_LIMIT} alertas del plan free. Sacá alguna o pasate a premium.`,
        });
        return;
      }
    }
    const next = await toggleWatch(userId, ean, displayName, currently);
    setWatched((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(ean);
      else copy.delete(ean);
      return copy;
    });
    setNotice({ text: next ? 'Listo, te avisamos si cambia el precio.' : 'Dejaste de seguir este precio.' });
  }

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

  // Lista plana de tarjetas. Sin encabezado por rubro: los rubros ahora se
  // eligen arriba (chips y filtros). Se conserva el orden por rubro, así lo
  // que es del mismo rubro sigue junto, y el orden por precio (si se pidió)
  // se aplica a toda la lista.
  const flat = orderedCats.flatMap((cat) => byCat.get(cat)!.map((g) => ({ ...g, cat })));
  const ordered = sortGroups(flat, sortOrder);

  return (
    <>
      <div className="pcard-list">
        {ordered.map(({ item, precio, cat }) => {
          const ean = extractEan(item);
          const id = cartIdFor(item);
          const displayName = displayNameFor(item);
          const nombre = item.nombre?.trim() || item.presentacion?.trim() || item.marca || 'Producto';
          const title = niceCase(nombre);
          // Marca y presentación juntas debajo del nombre (La Serenisima · 1 lt).
          const sub = [niceCase(item.marca), niceCase(item.presentacion)].filter(Boolean).join(' · ');
          return (
            <ProductCard
              key={id}
              title={title}
              subtitle={sub}
              initialsFrom={item.marca?.trim() || nombre}
              ean={ean}
              fallbackPrice={precio}
              stores={stores}
              isSelected={!!selected[id]}
              adding={addingId === id}
              watching={!!ean && watched.has(ean)}
              onOpen={() => setOpenProduct({ id, displayName, category: cat, ean, presentacion: item.presentacion })}
              onToggleCart={() => handleQuickToggle(id, displayName, cat, ean)}
              onToggleWatch={() => handleToggleWatch(ean, displayName)}
            />
          );
        })}
      </div>

      {notice && (
        <div className="pcard-notice" role="status">
          <span>{notice.text}</span>
          {notice.login && (
            <Link href="/login" className="pcard-notice-cta">
              Crear cuenta
            </Link>
          )}
        </div>
      )}

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
