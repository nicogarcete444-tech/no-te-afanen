'use client';

import { useMemo, useRef, useState } from 'react';
import { fmt } from '@/lib/products';
import { bestPerProduct, cartStats, ChosenEntry, estimatedStoreTotals, globalStoreIndex, potentialSavings, potentialSavingsByCategory } from '@/lib/cartStats';
import { CartMap, Product, lowestKnownPrice } from '@/lib/types';
import { addSaving } from '@/lib/savingsHistory';
import { buildShareCardCanvas, shareOrDownloadCard } from '@/lib/shareCard';
import StoreLogo, { chainLabel, getStoreLogo } from './StoreLogo';

const STORE_COLORS = ['#2E8B57', '#3B6FD1', '#D79A34', '#B5533F', '#7C5CBF', '#1E8C86'];

// Arma el texto de la lista de compras: cada producto con su precio y el
// súper más barato PARA ESE producto puntual (pueden ser súpers distintos
// entre sí), más un resumen de a qué súper conviene ir si preferís comprar
// todo en un solo lugar.
function buildShoppingListText(
  chosenEntries: ChosenEntry[],
  stores: string[],
  order: number[],
  totals: number[],
  complete: boolean[]
): string {
  const lineas = bestPerProduct(chosenEntries).map((p) => {
    const cantidad = p.qty > 1 ? `x${p.qty} ` : '';
    if (p.precio === null) return `🛒 ${cantidad}${p.name} — sin precio confirmado por súper`;
    return `🛒 ${cantidad}${p.name} — ${fmt(p.precio)} c/u${p.store ? ` (${p.store})` : ''}`;
  });

  const totalMejorPorProducto = bestPerProduct(chosenEntries).reduce(
    (sum, p) => sum + (p.precio ?? 0) * p.qty,
    0
  );

  const partes = ['🛒 Mi lista de compras — No Te Afanen', '', ...lineas, ''];
  partes.push(`Total comprando cada producto en su súper más barato: ${fmt(totalMejorPorProducto)}`);

  const primeraCompleta = order.find((i) => complete[i]);
  if (stores.length && primeraCompleta !== undefined) {
    partes.push(`Si preferís ir a un solo súper, el más conveniente es ${stores[primeraCompleta]}: ${fmt(totals[primeraCompleta])}`);
  }

  return partes.join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // seguimos con el respaldo de abajo
  }
  // Respaldo para navegadores/webviews sin Clipboard API (o sin HTTPS).
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// "Actualizado hoy, 08:40" / "Actualizado ayer, 21:15" / "Actualizado el 12/09, 10:02".
// Se arma con la hora real de los precios (el más viejo del carrito), no con
// un "hace X min" que envejece solo mientras la pantalla queda abierta.
function formatUpdated(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return `Actualizado hoy, ${hhmm}`;
  if (days === 1) return `Actualizado ayer, ${hhmm}`;
  const dm = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return `Actualizado el ${dm}, ${hhmm}`;
}

export default function CompareSection({
  selected,
  productIndex,
  stores,
  userId,
  premium,
  onSavingLogged,
  revealed = true,
  remaining,
  onReveal,
  pricesAgeLabel,
  refreshing = false,
  onRefreshPrices,
  pricesAt,
  onEdit,
}: {
  selected: CartMap;
  productIndex: Record<string, Product>;
  stores: string[];
  userId: string | null;
  premium: boolean;
  onSavingLogged?: () => void;
  // false: cuenta free que todavía no pidió ver el desglose de esta visita
  // (o ya gastó sus 3 comparaciones de la semana). En vez del desglose por
  // súper, se muestra una tarjeta para revelarlo (o para pasar a premium
  // si no le quedan usos). Premium siempre llega con revealed=true.
  revealed?: boolean;
  // usos de la semana que le quedan al plan free (irrelevante si revealed).
  remaining?: number;
  onReveal?: () => void;
  // "hace 20 min", "ayer"… de cuándo son los precios que se están mostrando.
  pricesAgeLabel?: string | null;
  refreshing?: boolean;
  onRefreshPrices?: () => void;
  // Cuándo se trajo el precio más viejo del carrito (Date.now()), para el
  // "Actualizado hoy, 08:40" de abajo de la tarjeta.
  pricesAt?: number | null;
  // "Editar": abre el carrito para sacar o cambiar cantidades.
  onEdit?: () => void;
}) {
  const { chosenEntries, totals, order, wins, complete } = cartStats(selected, productIndex, stores);

  // Hasta 6 súpers para la comparación visual (ver MAX_CHAINS en
  // lib/storePrices.ts: ahora se chequean 6 cadenas cercanas en vez de 4,
  // así la comparación no se queda en 2 apenas alguna no tenga cargado un
  // producto puntual), con un total ESTIMADO cuando falta el precio
  // confirmado de algún producto (se completa con el promedio conocido de
  // ese producto en otras cadenas). Antes esta lista solo incluía súpers
  // con precio confirmado de TODO el carrito, así que con unos pocos
  // productos casi siempre quedaba un solo súper (o ninguno) y no había
  // nada para comparar.
  const MAX_STORES_SHOWN = 6;
  const storeTotals = estimatedStoreTotals(chosenEntries, stores).slice(0, MAX_STORES_SHOWN);
  const shownStoreIdx = new Set(storeTotals.map((st) => st.storeIndex));
  const minEstTotal = storeTotals.length ? storeTotals[0].total : 0;
  const maxEstTotal = storeTotals.length ? storeTotals[storeTotals.length - 1].total : 0;

  // Cuando el carrito está vacío mostramos, en vez del mensaje genérico, un
  // panorama general de qué súper conviene más "en promedio" según todos
  // los productos que el usuario ya vio (no solo los del carrito actual).
  const globalIdx = useMemo(
    () => globalStoreIndex(productIndex, stores),
    [productIndex, stores]
  );
  const globalOrder = stores
    .map((_, i) => i)
    .filter((i) => globalIdx.avgOverpayPct[i] != null)
    .sort((a, b) => (globalIdx.avgOverpayPct[a] as number) - (globalIdx.avgOverpayPct[b] as number));
  const hasGlobalChart = chosenEntries.length === 0 && globalIdx.sampleSize >= 3 && globalOrder.length >= 2;
  const globalMaxPct = hasGlobalChart
    ? Math.max(1, ...globalOrder.map((i) => globalIdx.avgOverpayPct[i] as number))
    : 1;

  const [includeOpen, setIncludeOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ahorro de esta compra: sumamos, producto por producto, la diferencia
  // entre el súper más caro y el más barato que lo tienen. No depende de
  // que un solo súper tenga precio confirmado de TODO el carrito (eso casi
  // nunca pasa con varios productos), así que el ahorro se registra aunque
  // los datos por súper estén incompletos.
  const savingAmount = potentialSavings(chosenEntries);
  // Mismo cálculo, pero por rubro — se guarda junto con el ahorro para
  // poder armar la torta de "en qué rubro ahorrás más" en "Tus ahorros".
  const savingByCategory = potentialSavingsByCategory(chosenEntries);

  async function handleCopyList() {
    const text = buildShoppingListText(chosenEntries, stores, order, totals, complete);
    const ok = await copyText(text);
    setCopyStatus(ok ? 'ok' : 'error');
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopyStatus('idle'), 2600);

    // Al confirmar la lista (copiarla para ir a comprar), sumamos el ahorro
    // de esta compra al total del mes. No depende de que el carrito siga
    // como está: queda guardado en el historial aparte.
    if (ok && savingAmount > 0) {
      const logged = await addSaving(userId, savingAmount, savingByCategory);
      if (logged) onSavingLogged?.();
    }
  }

  // Compartir por WhatsApp (free): mismo texto que "Copiar lista", pero
  // abre directo la app/web de WhatsApp con el mensaje ya cargado en vez de
  // depender de que el usuario lo pegue a mano.
  function handleShareWhatsapp() {
    const text = buildShoppingListText(chosenEntries, stores, order, totals, complete);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  // Tarjeta/imagen prolija (premium): arma un PNG con Canvas y lo comparte
  // (o descarga si el navegador no soporta compartir archivos).
  const [cardStatus, setCardStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const cardTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function handleShareCard() {
    if (!premium || cardStatus === 'busy') return;
    setCardStatus('busy');
    const bestIdx = order.find((i) => complete[i]);
    const bestStoreLabel = bestIdx !== undefined ? stores[bestIdx] : null;
    const bestStoreTotal = bestIdx !== undefined ? totals[bestIdx] : null;
    const canvas = buildShareCardCanvas(chosenEntries, bestStoreLabel ?? null, bestStoreTotal ?? null, savingAmount);
    const result = await shareOrDownloadCard(canvas);
    setCardStatus(result === 'error' ? 'error' : 'ok');
    if (cardTimeout.current) clearTimeout(cardTimeout.current);
    cardTimeout.current = setTimeout(() => setCardStatus('idle'), 2600);
  }

  const best = bestPerProduct(chosenEntries);
  const totalUnits = chosenEntries.reduce((sum, e) => sum + e.qty, 0);

  return (
    <div className="main-compare-block" id="mainCompareBlock">
      <div className="dc-head">
        <h2>Dónde conviene hoy</h2>
        {chosenEntries.length > 0 && onEdit && (
          <button type="button" className="dc-link" onClick={onEdit}>
            Editar
          </button>
        )}
      </div>

      {chosenEntries.length === 0 && !hasGlobalChart && (
        <div className="compare-sub">Agregá productos al carrito para ver en qué súper te conviene comprarlos.</div>
      )}

      {chosenEntries.length === 0 && hasGlobalChart && (
        <div className="savings-chart">
          {globalOrder.map((si, pos) => {
            const pct = globalIdx.avgOverpayPct[si] as number;
            const isBest = si === globalOrder[0];
            const isWorst = pos === globalOrder.length - 1 && pct > 0;
            // La barra representa qué tan buen precio es, no cuánto se
            // sobrepaga: el mejor precio queda con la barra llena y el
            // resto se achica a medida que se aleja del mejor precio.
            const heightPct = Math.max(4, 100 - Math.round((pct / globalMaxPct) * 100));
            return (
              <div className="savings-chart-col" key={si}>
                <div
                  className="savings-chart-val"
                  style={{
                    color: isBest ? 'var(--check-green)' : isWorst ? 'var(--up)' : undefined,
                    fontWeight: isBest || isWorst ? 700 : undefined,
                  }}
                >
                  {isBest ? 'Mejor precio' : `+${Math.round(pct)}%`}
                </div>
                <div className="savings-chart-track">
                  <div
                    className={`savings-chart-bar${isBest ? ' current' : isWorst ? ' worst' : ''}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="savings-chart-label">
                  <StoreLogo chain={stores[si]} size={16} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chosenEntries.length > 0 && !revealed && (remaining ?? 0) > 0 && (
        <div className="compare-locked">
          <div className="compare-locked-title">Tu carrito está listo para comparar</div>
          <div className="compare-locked-text">
            Te quedan {remaining} de 3 comparaciones esta semana en el plan free. Tocá el botón
            para ver quién gana cada producto y el total por súper.
          </div>
          {onReveal && (
            <button className="cta-btn" style={{ width: '100%' }} onClick={onReveal}>
              Comparar ahora
            </button>
          )}
        </div>
      )}

      {chosenEntries.length > 0 && !revealed && (remaining ?? 0) <= 0 && (
        <div className="compare-locked">
          <div className="compare-locked-title">Ya usaste tus 3 comparaciones de esta semana 🔒</div>
          <div className="compare-locked-text">
            El plan free incluye 3 comparaciones de carrito por semana (se renuevan el lunes).
            Pasate a premium para comparar sin límite.
          </div>
        </div>
      )}

      {chosenEntries.length > 0 && revealed && (
        <>
          <div className="dc-card">
            {storeTotals.map((st) => {
              // Marcamos por VALOR, no por posición: si dos o más súpers
              // empatan en el total más bajo, todos se marcan — no solo el
              // primero que aparece en el orden. Así nadie parece "el
              // elegido" cuando en realidad hay un empate.
              const isBest = st.total === minEstTotal;
              const diff = st.total - minEstTotal;
              const chain = stores[st.storeIndex];
              return (
                <div className="dc-row" key={st.storeIndex}>
                  <span className="dc-logo">
                    {getStoreLogo(chain) ? (
                      <StoreLogo chain={chain} size={26} />
                    ) : (
                      <span className="dc-logo-letter">{chain.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="dc-mid">
                    <div className="dc-name-line">
                      <span className="dc-name">{chainLabel(chain)}</span>
                      {isBest && <span className="dc-best">Más barato</span>}
                      {!st.complete && <span className="dc-est">Estimado</span>}
                    </div>
                    <div className="dc-track">
                      {/* El ancho va inline y el llenado es una animación CSS de
                          entrada: antes se seteaba desde un efecto que solo
                          corría si cambiaba el total, y las barras quedaban
                          vacías si el desglose se revelaba sin cambios. */}
                      <div
                        className={`dc-fill${isBest ? ' best' : ''}`}
                        style={{ width: `${maxEstTotal ? Math.min(100, Math.round((st.total / maxEstTotal) * 100)) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="dc-amt">
                    <span className="dc-amt-total">{fmt(st.total)}</span>
                    {!isBest && diff > 0 && <span className="dc-amt-diff">+{fmt(diff)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dc-meta">
            <span>
              {refreshing
                ? 'Actualizando precios…'
                : pricesAt
                ? formatUpdated(pricesAt)
                : 'Precios oficiales de Precios Claros'}
            </span>
            <button
              type="button"
              className="dc-link"
              aria-expanded={includeOpen}
              onClick={() => setIncludeOpen((v) => !v)}
            >
              Qué incluye
            </button>
          </div>

          {includeOpen && (
            <div className="dc-include">
              <div className="dc-include-title">Qué incluye esta comparación</div>
              <p className="dc-include-text">
                Suma tu canasta de {chosenEntries.length} producto{chosenEntries.length === 1 ? '' : 's'}
                {totalUnits !== chosenEntries.length ? ` (${totalUnits} unidades)` : ''} en cada súper cercano,
                con los precios de Precios Claros. Si un súper no informó el precio de algún producto, se
                completa con el promedio de los demás y aparece marcado como “Estimado”.
              </p>

              <div className="wins-row">
                {stores.map((s, si) => ({ s, si }))
                  // Los mismos súpers que aparecen arriba en la tarjeta, para
                  // que estos chips no mencionen uno que no se ve en el
                  // desglose de totales.
                  .filter(({ si }) => shownStoreIdx.has(si))
                  .map(({ s, si }) => (
                    <div className={`win-chip${wins[si] === 0 ? ' zero' : ''}`} key={s}>
                      <span className="dot" style={{ background: STORE_COLORS[si % STORE_COLORS.length] }} />
                      <StoreLogo chain={s} size={16} />: <strong>{wins[si]}</strong>/{chosenEntries.length}
                    </div>
                  ))}
              </div>

              <div className="dc-include-list">
                {best.map((p) => (
                  <div className="dc-include-item" key={p.id}>
                    <span className="dc-include-item-name">
                      {p.qty > 1 ? `${p.qty} × ` : ''}
                      {p.name}
                    </span>
                    <span className="dc-include-item-price">
                      {p.precio === null ? 'sin precio' : `${fmt(p.precio)}${p.store ? ` · ${chainLabel(p.store)}` : ''}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* De cuándo son estos precios, y refrescarlos a mano. */}
              <div className="price-freshness">
                <span className="price-freshness-dot" />
                <span>
                  {refreshing
                    ? 'Actualizando precios…'
                    : pricesAgeLabel
                    ? `Precios de Precios Claros, traídos ${pricesAgeLabel}`
                    : 'Precios oficiales de Precios Claros'}
                </span>
                {onRefreshPrices && (
                  <button
                    type="button"
                    className="price-freshness-refresh"
                    onClick={onRefreshPrices}
                    disabled={refreshing}
                  >
                    Actualizar
                  </button>
                )}
              </div>

              <div className="copy-list-block">
                <button className="cta-btn secondary" style={{ width: '100%' }} onClick={handleCopyList}>
                  {copyStatus === 'ok'
                    ? savingAmount > 0
                      ? `¡Lista copiada! Sumamos ${fmt(savingAmount)} a tu ahorro del mes ✓`
                      : '¡Lista copiada! ✓'
                    : copyStatus === 'error'
                    ? 'No se pudo copiar, probá de nuevo'
                    : 'Copiar lista y sumar a mi ahorro del mes'}
                </button>
                <div className="copy-list-hint">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
                    <circle cx="9.5" cy="19" r="1.3" />
                    <circle cx="16.5" cy="19" r="1.3" />
                  </svg>
                  Copiamos cada producto con su mejor precio y sumamos el ahorro a tu cuenta.
                </div>
              </div>

              <div className="share-row">
                <button className="cta-btn secondary share-btn" style={{ width: '100%' }} onClick={handleShareWhatsapp}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="2.4" /><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="19" r="2.4" />
                    <path d="M8.1 10.7l7.8-4.4M8.1 13.3l7.8 4.4" />
                  </svg>
                  Compartir por WhatsApp
                </button>
                {premium ? (
                  <button className="cta-btn secondary share-btn" style={{ width: '100%' }} onClick={handleShareCard} disabled={cardStatus === 'busy'}>
                    {cardStatus === 'busy'
                      ? 'Armando la tarjeta…'
                      : cardStatus === 'ok'
                      ? '¡Lista! ✓'
                      : cardStatus === 'error'
                      ? 'No se pudo generar, probá de nuevo'
                      : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5.5-5.5L5 20" />
                          </svg>
                          Compartir como tarjeta
                        </>
                      )}
                  </button>
                ) : (
                  <div className="share-premium-hint">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    La tarjeta prolija para compartir (con imagen, no solo texto) es una función
                    premium.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
