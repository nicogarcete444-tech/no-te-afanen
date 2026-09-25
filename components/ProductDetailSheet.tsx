'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CATEGORY_COLORS } from '@/lib/categories';
import { fmt } from '@/lib/format';
import { getProductImageUrls } from '@/lib/productImage';
import { fetchStorePriceDetails, NearbyStore, StorePriceDetail } from '@/lib/storePrices';
import { getStoreBuyUrl } from '@/lib/storeLinks';
import { getPriceHistory, PricePoint, trackProduct } from '@/lib/priceHistory';
import { FREE_ALERT_LIMIT, getWatchedCount, isWatching, toggleWatch } from '@/lib/priceAlerts';
import { computeUnitPrice } from '@/lib/unitPrice';
import StoreLogo from './StoreLogo';

const FALLBACK_ICON_PATH =
  'M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2';

// Separa el precio en parte entera (con puntos de miles) y centavos, para
// poder mostrar los centavos como superíndice igual que en la captura. No
// inventa nada: son los mismos decimales que ya viene informando la API.
function splitAmount(n: number): { main: string; cents: string } {
  const rounded = Math.max(0, Math.round(n * 100) / 100);
  const [intPart, decPart = '00'] = rounded.toFixed(2).split('.');
  return { main: '$ ' + Number(intPart).toLocaleString('es-AR'), cents: decPart };
}

export type ProductDetailInfo = {
  id: string;
  displayName: string;
  category: string;
  ean: string | null;
  presentacion?: string;
};

// Mini-gráfico de evolución de precio, en SVG puro (sin librería de charts,
// para no sumar peso a un componente que ya se monta seguido). Solo se
// muestra cuando ya hay al menos 2 días de historial acumulado — con 1 solo
// punto no hay "evolución" que mostrar todavía.
function PriceHistoryChart({ history }: { history: PricePoint[] }) {
  const W = 280;
  const H = 56;
  const PAD = 4;

  const prices = history.map((h) => h.precio);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = history.map((h, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((h.precio - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = history[0];
  const last = history[history.length - 1];
  const pctChange = first.precio ? Math.round(((last.precio - first.precio) / first.precio) * 100) : 0;
  const rangeLabel =
    new Date(first.date + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) +
    ' – ' +
    new Date(last.date + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  return (
    <div className="pd-history">
      <div className="pd-history-head">
        <h2>Evolución del precio</h2>
        <span className={`pd-vs-badge${pctChange < 0 ? ' down' : pctChange > 0 ? ' up' : ''}`}>
          {pctChange === 0 ? 'sin cambios' : `${pctChange > 0 ? '+' : ''}${pctChange}%`}
        </span>
      </div>
      <p className="pd-history-range">Referencia de sucursales cercanas al Obelisco (CABA); puede no representar tu zona.</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pd-history-svg">
        <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="pd-history-range">{rangeLabel}</div>
    </div>
  );
}

export default function ProductDetailSheet({
  open,
  product,
  stores,
  isSelected,
  userId,
  premium,
  onClose,
  onToggleCart,
}: {
  open: boolean;
  product: ProductDetailInfo | null;
  stores: NearbyStore[];
  isSelected: boolean;
  userId: string | null;
  premium: boolean;
  onClose: () => void;
  onToggleCart: (priceByStore: Record<string, number>) => void;
}) {
  const [details, setDetails] = useState<Record<string, StorePriceDetail> | null | 'loading'>(null);
  // Array de fotos candidatas (por prioridad) e índice de cuál se está
  // mostrando: si la actual rompe al cargar (onError), se pasa a la
  // siguiente de la misma lista sin volver a pedirle nada al server.
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUrl = photoUrls[photoIndex] ?? null;
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [alertLimitNotice, setAlertLimitNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !product?.ean || !userId) {
      setWatching(false);
      return;
    }
    let cancelled = false;
    isWatching(userId, product.ean).then((res) => {
      if (!cancelled) setWatching(res);
    });
    return () => {
      cancelled = true;
    };
  }, [open, product?.ean, userId]);

  async function handleToggleWatch() {
    if (!userId || !product?.ean || watchBusy) return;
    setWatchBusy(true);
    // El tope de free solo frena PRENDER una alerta nueva; apagar una
    // (sacarla de vigilancia) nunca está limitado.
    if (!watching && !premium) {
      const current = await getWatchedCount(userId);
      if (current >= FREE_ALERT_LIMIT) {
        setAlertLimitNotice(
          `Llegaste al tope de ${FREE_ALERT_LIMIT} alertas del plan free. Sacá alguna o pasate a premium para alertas sin límite.`
        );
        setWatchBusy(false);
        return;
      }
    }
    const next = await toggleWatch(userId, product.ean, product.displayName, watching);
    setWatching(next);
    setWatchBusy(false);
  }

  // Escape cierra la ficha, como cualquier pantalla que se abre encima.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!alertLimitNotice) return;
    const t = setTimeout(() => setAlertLimitNotice(null), 4000);
    return () => clearTimeout(t);
  }, [alertLimitNotice]);

  useEffect(() => {
    if (!open || !product) return;
    setPhotoUrls([]);
    setPhotoIndex(0);
    setDetails(product.ean && stores.length ? 'loading' : null);
    setHistory([]);

    let cancelled = false;
    if (product.ean) {
      getProductImageUrls(product.ean, product.displayName).then((urls) => {
        if (!cancelled) setPhotoUrls(urls);
      });
      // Avisa que este producto se está viendo (para que el cron de
      // historial lo empiece a seguir) y trae el historial ya acumulado,
      // si hay. Ninguna de las dos cosas bloquea el resto de la ficha.
      trackProduct(product.ean, product.displayName);
      getPriceHistory(product.ean).then((res) => {
        if (!cancelled) setHistory(res);
      });
    }
    if (product.ean && stores.length) {
      fetchStorePriceDetails(product.ean, stores).then((res) => {
        if (!cancelled) setDetails(res);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, stores]);

  if (!open || !product) return null;

  const resolved = details && details !== 'loading' ? details : null;
  const entries = resolved ? Object.entries(resolved) : [];
  const sortedEntries = [...entries].sort((a, b) => a[1].precio - b[1].precio);
  const prices = entries.map(([, d]) => d.precio);
  const best = prices.length ? Math.min(...prices) : 0;
  const worst = prices.length ? Math.max(...prices) : 0;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const bestChain = sortedEntries[0]?.[0];
  const bestBuyUrl = bestChain ? getStoreBuyUrl(bestChain, product.displayName) : null;
  const pctVsAvg = avg ? Math.round(((best - avg) / avg) * 100) : 0;
  const dotColor = (CATEGORY_COLORS[product.category] || ['#B9C0BB', '#8B948A'])[1];
  const bestAmount = splitAmount(best);
  // Precio por kg/L (o por unidad), calculado sobre el mejor precio
  // encontrado. Si la "presentación" no trae un peso/volumen interpretable,
  // computeUnitPrice devuelve null y simplemente no se muestra nada — nunca
  // se inventa un número.
  const unitPrice = best ? computeUnitPrice(best, product.presentacion) : null;

  function handleCartClick() {
    // Al carrito va el precio real de cada cadena, guardado POR NOMBRE de
    // cadena. Las cadenas para las que Precios Claros no reportó nada
    // simplemente no aparecen: no se rellenan con el precio de otro súper,
    // así la comparación sabe que ese total está incompleto y no lo muestra
    // como si fuera el precio final.
    const priceByStore: Record<string, number> = {};
    stores.forEach((s) => {
      const detail = resolved?.[s.chain];
      if (detail) priceByStore[s.chain] = detail.precio;
    });
    onToggleCart(priceByStore);
  }

  return (
    <div className="pd-overlay show">
      <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={product.displayName}>
        <div className="pd-scroll">
          <div className="pd-top-row">
            <div className="pd-eyebrow">
              <span className="cat-dot" style={{ background: dotColor }} />
              RUBRO · {product.category.toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Antes era un botón redondo con solo el ícono de campanita:
                  el título (tooltip) que explicaba qué hacía no se ve nunca
                  en celular, así que quedaba un botón sin ninguna pista de
                  qué tocaba. Ahora lleva texto al lado siempre visible, y el
                  estado (siguiendo / no) también se lee sin adivinar. */}
              {product.ean && userId && (
                <button
                  className={`pd-alert-btn${watching ? ' active' : ''}`}
                  onClick={handleToggleWatch}
                  disabled={watchBusy}
                  title={watching ? 'Dejar de seguir este precio' : 'Seguir este precio (avisamos si sube o baja)'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={watching ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 4.5-1.5 6-2 7h16c-.5-1-2-2.5-2-7Z" />
                    <path d="M10 20a2 2 0 0 0 4 0" />
                  </svg>
                  <span>{watching ? 'Siguiendo' : 'Seguir precio'}</span>
                </button>
              )}
              {product.ean && !userId && (
                <Link href="/login" className="pd-alert-btn" title="Iniciá sesión para seguir este precio">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 4.5-1.5 6-2 7h16c-.5-1-2-2.5-2-7Z" />
                    <path d="M10 20a2 2 0 0 0 4 0" />
                  </svg>
                  <span>Seguir precio</span>
                </Link>
              )}
              <button className="cart-sheet-close" onClick={onClose} aria-label="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <h1 className="pd-title">{product.displayName}</h1>
          {product.presentacion && <div className="pd-sub">{product.presentacion}</div>}

          {alertLimitNotice && <div className="pd-alert-limit-notice">{alertLimitNotice}</div>}

          <div className="pd-hero">
            <div className="pd-hero-top">
              <div className={`pd-hero-media${photoUrl ? ' has-photo' : ' no-photo'}`}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" width={104} height={104} loading="lazy" decoding="async" onError={() => setPhotoIndex((i) => i + 1)} />
                ) : (
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d={FALLBACK_ICON_PATH} />
                    <circle cx="9.5" cy="19" r="1.3" /><circle cx="16.5" cy="19" r="1.3" />
                  </svg>
                )}
              </div>
              <div className="pd-hero-price">
                <div className="pd-hero-label">Mejor precio</div>
                {details === 'loading' ? (
                  <div className="pd-hero-amount pd-loading">Buscando precio por súper…</div>
                ) : best ? (
                  <>
                    <div className="pd-hero-amount">
                      {bestAmount.main}
                      <sup>{bestAmount.cents}</sup>
                    </div>
                    {unitPrice && <div className="pd-hero-unit">{unitPrice.label}</div>}
                    {bestChain && (
                      <div className="pd-hero-store">
                        <StoreLogo chain={bestChain} size={15} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="pd-hero-amount pd-loading">Sin precio por súper disponible</div>
                )}
              </div>
            </div>

            {prices.length > 1 && (
              <div className="pd-hero-avg-row">
                <div>
                  <div className="pd-hero-label">Promedio</div>
                  <div className="pd-avg-amount">{fmt(avg)}</div>
                </div>
                <span className={`pd-vs-badge${pctVsAvg < 0 ? ' down' : pctVsAvg > 0 ? ' up' : ''}`}>
                  {pctVsAvg === 0 ? '= promedio' : `${pctVsAvg > 0 ? '+' : ''}${pctVsAvg}% vs promedio`}
                </span>
              </div>
            )}
          </div>

          {history.length >= 2 && <PriceHistoryChart history={history} />}

          <div className="pd-stores-header">
            <h2>Precios por supermercado</h2>
            <span className="list-count">
              {entries.length ? `${entries.length} supermercado${entries.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>

          {details === 'loading' ? (
            <div className="skeleton">
              <div className="sk-line w60" />
              <div className="sk-line full" />
            </div>
          ) : !entries.length ? (
            <div className="empty-state">No encontramos precios por súper para este producto ahora mismo.</div>
          ) : (
            <div className="pd-stores-grid">
              {sortedEntries.map(([chain, d]) => {
                const buyUrl = getStoreBuyUrl(chain, product.displayName);
                // Comparamos por VALOR, no por posición: si dos o más súpers
                // empatan en el precio más bajo (o más alto), todos se marcan.
                const isBest = d.precio === best;
                const isWorst = !isBest && d.precio === worst && worst > best;
                const isMid = !isBest && !isWorst && entries.length > 2;
                return (
                  <div className="pd-store-card" key={chain}>
                    <div className="pd-store-top">
                      <StoreLogo chain={chain} size={18} />
                      {isBest && <span className="best-flag">Mejor precio</span>}
                      {isWorst && <span className="worst-flag">Más caro</span>}
                      {isMid && <span className="mid-flag">Precio medio</span>}
                    </div>
                    <div className="pd-store-price">
                      {fmt(d.precio)}
                      {d.precioLista && <span className="pd-store-old">{fmt(d.precioLista)}</span>}
                    </div>
                    {d.discountPct ? <span className="pd-discount-chip">{d.discountPct}% off</span> : null}
                    {buyUrl && (
                      <a
                        className="pd-store-buy-link"
                        href={buyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Comprar acá
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17 17 7M8 7h9v9" />
                        </svg>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!!bestChain && !!best && (
            <div className="pd-buy-note">
              Comprá cada producto por separado en el súper que más te convenga — no hace falta armar un carrito completo si buscás una sola cosa.
            </div>
          )}
        </div>

        <div className="cart-sheet-foot">
          <div className="pd-cta-row">
            <button
              className="cta-btn secondary"
              style={{ marginTop: 0 }}
              onClick={handleCartClick}
              // Mientras `details` está en 'loading' todavía no sabemos el
              // precio en ningún súper. Si se agregaba igual, el producto
              // quedaba guardado en el carrito con todos los precios en null
              // y ya nunca aportaba nada a la comparación.
              disabled={!isSelected && details === 'loading'}
            >
              {isSelected
                ? 'Quitar del carrito'
                : details === 'loading'
                ? 'Buscando precios…'
                : 'Agregar al carrito'}
            </button>
            {bestChain && bestBuyUrl ? (
              <a
                className="cta-btn"
                style={{ marginTop: 0, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                href={bestBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Comprar en {bestChain}
              </a>
            ) : (
              <button className="cta-btn" style={{ marginTop: 0 }} disabled title="Todavía no tenemos precio por súper para este producto">
                Comprar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
