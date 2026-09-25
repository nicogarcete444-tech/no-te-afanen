'use client';

import { useMemo, useRef, useState } from 'react';
import { fmt } from '@/lib/format';
import { bestPerProduct, cartStats, ChosenEntry, estimatedStoreTotals, globalStoreIndex, potentialSavings, potentialSavingsByCategory } from '@/lib/cartStats';
import { CartMap, Product } from '@/lib/types';
import { addSaving } from '@/lib/savingsHistory';
import { LiveItem } from '@/lib/liveItems';
import { NearbyStore } from '@/lib/storePrices';
import StoreTotalRows, { TotalRow } from './StoreTotalRows';
import GeneralCompare from './GeneralCompare';

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
  refreshing = false,
  onRefreshPrices,
  pricesAt,
  onEdit,
  generalPool,
  generalStores,
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
  refreshing?: boolean;
  onRefreshPrices?: () => void;
  // Cuándo se trajo el precio más viejo del carrito (Date.now()), para el
  // "Actualizado hoy, 08:40" de abajo de la tarjeta.
  pricesAt?: number | null;
  // "Editar": abre el carrito para sacar o cambiar cantidades.
  onEdit?: () => void;
  // Para la comparación general (carrito vacío): los productos de la portada
  // y los súpers cercanos, de donde salen los precios de la canasta de ejemplo.
  generalPool?: LiveItem[];
  generalStores?: NearbyStore[];
}) {
  const { chosenEntries, totals, order, complete } = cartStats(selected, productIndex, stores);

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
  // Filas en el mismo formato que usa StoreTotalRows (imagen de "Dónde
  // conviene hoy" con canasta real): así el panorama histórico se ve
  // igual que la comparación real en vez de un gráfico de barras distinto.
  const globalRows: TotalRow[] = hasGlobalChart
    ? globalOrder.map((si, pos) => ({
        key: si,
        chain: stores[si],
        total: globalIdx.avgOverpayPct[si] as number,
        isBest: pos === 0,
        diff: (globalIdx.avgOverpayPct[si] as number) - (globalIdx.avgOverpayPct[globalOrder[0]] as number),
        estimated: false,
      }))
    : [];
  const globalMaxTotal = Math.max(1, ...globalRows.map((r) => r.total));

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

  // "Copiar lista del súper": solo copia el texto. Sumar el ahorro al mes es
  // otro botón (handleAddSaving); antes eran un solo botón que hacía las dos
  // cosas juntas.
  async function handleCopyList() {
    const text = buildShoppingListText(chosenEntries, stores, order, totals, complete);
    const ok = await copyText(text);
    setCopyStatus(ok ? 'ok' : 'error');
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopyStatus('idle'), 2600);
  }

  // "Agregar a mis ahorros": suma el ahorro de esta compra al total del mes
  // (queda guardado en el historial aparte). Se puede hacer una sola vez por
  // carrito: la firma (productos + cantidades) recuerda cuál ya se sumó, así
  // un doble toque no cuenta el mismo ahorro dos veces. Si el carrito cambia,
  // la firma cambia y el botón vuelve a estar disponible.
  const cartKey = chosenEntries.map((e) => `${e.id}:${e.qty}`).join('|');
  const [savingStatus, setSavingStatus] = useState<'idle' | 'busy' | 'error'>('idle');
  const [savedCartKey, setSavedCartKey] = useState<string | null>(null);
  const alreadySaved = savedCartKey === cartKey;

  async function handleAddSaving() {
    if (savingAmount <= 0 || alreadySaved || savingStatus === 'busy') return;
    setSavingStatus('busy');
    const logged = await addSaving(userId, savingAmount, savingByCategory);
    if (logged) {
      setSavedCartKey(cartKey);
      setSavingStatus('idle');
      onSavingLogged?.();
    } else {
      setSavingStatus('error');
    }
  }

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

      {/* Carrito vacío: en vez de dejar esto vacío, una comparación general
          de una canasta de ejemplo entre 4 súpers. Si todavía no se puede
          armar (sin ubicación, sin productos, Precios Claros caído), queda lo
          de antes: el panorama según lo que el usuario ya vio, o el cartel. */}
      {chosenEntries.length === 0 && (
        <GeneralCompare
          pool={generalPool ?? []}
          stores={generalStores ?? []}
          fallback={
            hasGlobalChart ? (
              <>
                <div className="compare-sub">
                  Panorama general según los productos que ya viste — agregá al carrito para compararlo con tu canasta real.
                </div>
                <div className="dc-card">
                  <StoreTotalRows
                    rows={globalRows}
                    maxTotal={globalMaxTotal}
                    formatAmount={(row) => ({
                      main: row.isBest ? 'Mejor precio' : `+${Math.round(row.total)}%`,
                    })}
                  />
                </div>
              </>
            ) : (
              <div className="compare-sub">Agregá productos al carrito para ver en qué súper te conviene comprarlos.</div>
            )
          }
        />
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
          <div className="compare-locked-title">Ya usaste tus 3 comparaciones de esta semana</div>
          <div className="compare-locked-text">
            El plan free incluye 3 comparaciones de carrito por semana (se renuevan el lunes).
            Pasate a premium para comparar sin límite.
          </div>
        </div>
      )}

      {chosenEntries.length > 0 && revealed && (
        <>
          <div className="dc-card">
            <StoreTotalRows
              rows={storeTotals.map((st) => ({
                key: st.storeIndex,
                chain: stores[st.storeIndex],
                total: st.total,
                // Marcamos por VALOR (ver TotalRow.isBest): con empate en el
                // total más bajo se marcan todos.
                isBest: st.total === minEstTotal,
                diff: st.total - minEstTotal,
                estimated: !st.complete,
              }))}
              maxTotal={maxEstTotal}
            />
          </div>

          <div className="dc-meta">
            <span>
              {refreshing
                ? 'Actualizando precios…'
                : pricesAt
                ? formatUpdated(pricesAt)
                : 'Precios oficiales de Precios Claros'}
            </span>
            {/* Acá estaba "Qué incluye". El "Actualizar" (refrescar los precios
                a mano) vivía adentro de esa tarjeta: se deja acá para no
                perder la función. */}
            {onRefreshPrices && (
              <button type="button" className="dc-link" onClick={onRefreshPrices} disabled={refreshing}>
                Actualizar
              </button>
            )}
          </div>

          <div className="compare-actions">
            <button className="cta-btn" onClick={handleCopyList}>
              {copyStatus === 'ok'
                ? '¡Lista copiada! ✓'
                : copyStatus === 'error'
                ? 'No se pudo copiar, probá de nuevo'
                : 'Copiar lista del súper'}
            </button>

            {/* Solo si hay algo para sumar (o ya se sumó): con ahorro 0 el botón
                no haría nada. */}
            {(savingAmount > 0 || alreadySaved) && (
              <button
                className="cta-btn secondary"
                onClick={handleAddSaving}
                disabled={alreadySaved || savingStatus === 'busy'}
              >
                {alreadySaved
                  ? '¡Sumado a tu ahorro del mes! ✓'
                  : savingStatus === 'busy'
                  ? 'Sumando…'
                  : savingStatus === 'error'
                  ? 'No se pudo sumar, probá de nuevo'
                  : `Agregar ${fmt(savingAmount)} a mis ahorros`}
              </button>
            )}

          </div>
        </>
      )}
    </div>
  );
}
