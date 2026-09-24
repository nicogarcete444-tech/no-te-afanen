'use client';

import { ReactNode, useEffect, useState } from 'react';
import { extractEan, LiveItem } from '@/lib/liveItems';
import { mapWithConcurrency } from '@/lib/nearbyDeals';
import { fetchStorePriceDetails, LIST_PRICE_MAX_AGE_MS, NearbyStore, StorePriceDetail } from '@/lib/storePrices';
import StoreTotalRows, { TotalRow } from './StoreTotalRows';

// Comparación general, para cuando el carrito está vacío: en vez de dejar el
// final de la página vacío, se compara una misma canasta de ejemplo (los
// productos variados de la portada: leche, arroz, yerba, pollo, shampoo...)
// entre 4 súpers cercanos. Son precios reales de Precios Claros — los mismos
// que ya se piden para las tarjetas de la portada, así que casi todo sale del
// caché de fetchStorePriceDetails y no suma pedidos nuevos.

// Cuántos productos como máximo entran en la canasta.
const BASKET_MAX = 12;
// Cuántos súpers se comparan.
const CHAINS_SHOWN = 4;
// Con menos productos en común la comparación no dice nada.
const BASKET_MIN = 3;

type Comparison = { rows: TotalRow[]; maxTotal: number; basketSize: number };

async function buildComparison(pool: LiveItem[], stores: NearbyStore[]): Promise<Comparison | null> {
  // Productos distintos (por código de barras), en el orden de la portada.
  const seen = new Set<string>();
  const eans: string[] = [];
  for (const item of pool) {
    const ean = extractEan(item);
    if (!ean || seen.has(ean)) continue;
    seen.add(ean);
    eans.push(ean);
    if (eans.length >= BASKET_MAX) break;
  }
  if (eans.length < BASKET_MIN) return null;

  const details = await mapWithConcurrency(eans, 4, (ean) => fetchStorePriceDetails(ean, stores, { maxAgeMs: LIST_PRICE_MAX_AGE_MS }));

  // Cadenas ordenadas por cuántos productos de la canasta tienen precio
  // (si hay empate, el orden en que ya vienen: primero las cadenas
  // nacionales grandes).
  const chains = stores.map((s) => s.chain);
  const countsByChain = chains
    .map((chain, i) => ({
      chain,
      i,
      n: details.filter((d) => typeof d?.[chain]?.precio === 'number').length,
    }))
    .sort((a, b) => b.n - a.n || a.i - b.i);

  // Se prueba primero con CHAINS_SHOWN cadenas y, si la intersección de
  // precios no alcanza, con una menos, y así hasta 2. Antes se probaba
  // ÚNICAMENTE con 4 cadenas fijas: si la cuarta tenía pocos precios
  // cargados ese día (algo que varía solo, según qué actualizó Precios
  // Claros), la intersección se quedaba corta y la comparación entera
  // desaparecía — aunque las primeras 2 o 3 cadenas de sobra tuvieran datos
  // para comparar. Por eso a veces salía y a veces no.
  for (let n = Math.min(CHAINS_SHOWN, countsByChain.length); n >= 2; n--) {
    const chosen = countsByChain.slice(0, n).map((c) => c.chain);

    // Solo cuentan los productos que tienen precio en TODAS las cadenas
    // elegidas: si no, una cadena parecería más barata solo por tener menos
    // productos cargados.
    const basket = details.filter(
      (d): d is Record<string, StorePriceDetail> => !!d && chosen.every((chain) => typeof d[chain]?.precio === 'number')
    );
    if (basket.length < BASKET_MIN) continue;

    const totals = chosen
      .map((chain) => ({ chain, total: basket.reduce((sum, d) => sum + d[chain].precio, 0) }))
      .sort((a, b) => a.total - b.total);
    const min = totals[0].total;
    const maxTotal = totals[totals.length - 1].total;

    return {
      rows: totals.map((t) => ({
        key: t.chain,
        chain: t.chain,
        total: t.total,
        isBest: t.total === min,
        diff: t.total - min,
        estimated: false,
      })),
      maxTotal,
      basketSize: basket.length,
    };
  }

  return null;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  | ({ status: 'ready' } & Comparison);

export default function GeneralCompare({
  pool,
  stores,
  fallback,
}: {
  // Productos de la portada (ya traídos de Precios Claros).
  pool: LiveItem[];
  stores: NearbyStore[];
  // Lo que se muestra si todavía no se puede armar la comparación (sin
  // ubicación, sin productos cargados, o Precios Claros sin responder).
  fallback: ReactNode;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  // Se vuelve a calcular si cambian los súpers cercanos o llegan más productos.
  const key = stores.map((s) => s.sucursalId).join(',') + '|' + pool.length;

  useEffect(() => {
    if (!stores.length || !pool.length) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    buildComparison(pool, stores)
      .then((result) => {
        if (!cancelled) setState(result ? { status: 'ready', ...result } : { status: 'empty' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'empty' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.status === 'idle' || state.status === 'empty') return <>{fallback}</>;

  if (state.status === 'loading') {
    return <div className="compare-sub">Comparando precios entre súpers…</div>;
  }

  return (
    <>
      <div className="compare-sub">
        Comparación general: una misma canasta de {state.basketSize} productos de distintos rubros en{' '}
        {state.rows.length} súpers cerca tuyo. Agregá productos al carrito para ver la tuya.
      </div>
      <div className="dc-card">
        <StoreTotalRows rows={state.rows} maxTotal={state.maxTotal} />
      </div>
      <div className="dc-meta">
        <span>Canasta de ejemplo · precios de Precios Claros</span>
      </div>
    </>
  );
}
