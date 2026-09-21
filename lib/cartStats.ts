import { CartMap, Product, highestKnownPrice, lowestKnownPrice } from './types';

export type ChosenEntry = Product & { id: string; qty: number };

export function cartStats(
  selected: CartMap,
  productIndex: Record<string, Product>,
  stores: string[]
) {
  const chosenEntries: ChosenEntry[] = Object.entries(selected)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const product = productIndex[id];
      return product ? { ...product, id, qty, prices: product.prices || {} } : null;
    })
    .filter((e): e is ChosenEntry => e !== null);

  // Total de la compra en cada cadena cercana. `stores` son los nombres
  // reales de las cadenas que encontramos cerca del usuario.
  const totals = stores.map((chain) =>
    chosenEntries.reduce((sum, p) => sum + (p.prices[chain] ?? 0) * p.qty, 0)
  );

  // Un súper solo entra en el ranking de "más barato para llevar todo junto"
  // si tenemos precio confirmado (no inventado) de TODOS los productos del
  // carrito en ese súper puntual. Si falta el dato de un solo producto, el
  // total de ese súper sería una suma parcial (más barato de lo real), así
  // que lo marcamos como incompleto en vez de mostrarlo como si fuera el
  // precio final.
  const complete = stores.map((chain) => chosenEntries.every((p) => p.prices[chain] != null));
  const completeIdx = stores.map((_, i) => i).filter((i) => complete[i]);
  const incompleteIdx = stores.map((_, i) => i).filter((i) => !complete[i]);

  const completeTotals = completeIdx.map((i) => totals[i]);
  const max = completeTotals.length ? Math.max(...completeTotals) : 0;
  const min = completeTotals.length ? Math.min(...completeTotals) : 0;

  // Orden: primero los súpers con datos completos (de más barato a más
  // caro), y al final los que tienen datos incompletos.
  const order = [
    ...[...completeIdx].sort((a, b) => totals[a] - totals[b]),
    ...[...incompleteIdx].sort((a, b) => totals[a] - totals[b]),
  ];

  // Cuántos productos "gana" cada cadena (los tiene al precio más bajo).
  const wins = stores.map(() => 0);
  chosenEntries.forEach((p) => {
    const lowest = lowestKnownPrice(p.prices);
    if (lowest === null) return;
    stores.forEach((chain, si) => {
      if (p.prices[chain] === lowest) wins[si]++;
    });
  });

  return { chosenEntries, totals, max, min, order, wins, complete };
}

// Ahorro real de la compra: para cada producto del carrito, la diferencia
// entre pagarlo en el súper más caro que lo tiene y en el más barato que lo
// tiene. A diferencia de "max - min" de arriba (que exige que UN MISMO súper
// tenga precio confirmado de TODOS los productos, algo que con Precios Claros
// casi nunca pasa si el carrito tiene varios ítems), esto se puede calcular
// producto por producto y no depende de que ningún súper esté "completo".
export function potentialSavings(chosenEntries: ChosenEntry[]): number {
  return chosenEntries.reduce((sum, p) => {
    const values = Object.values(p.prices || {});
    if (values.length < 2) return sum;
    const lo = lowestKnownPrice(p.prices)!;
    const hi = highestKnownPrice(p.prices)!;
    return sum + (hi - lo) * p.qty;
  }, 0);
}

// Lo mismo que potentialSavings, pero desglosado por rubro (para la torta
// de "Tus ahorros"). Un producto sin categoría cae en "Otros" en vez de
// perderse silenciosamente.
export function potentialSavingsByCategory(chosenEntries: ChosenEntry[]): Record<string, number> {
  const byCategory: Record<string, number> = {};
  chosenEntries.forEach((p) => {
    const values = Object.values(p.prices || {});
    if (values.length < 2) return;
    const lo = lowestKnownPrice(p.prices)!;
    const hi = highestKnownPrice(p.prices)!;
    const saved = (hi - lo) * p.qty;
    if (saved <= 0) return;
    const cat = p.category || 'Otros';
    byCategory[cat] = (byCategory[cat] || 0) + saved;
  });
  return byCategory;
}

export type StoreTotal = {
  storeIndex: number;
  // Total de la compra en ese súper. Para los productos con precio
  // confirmado usamos ese precio; para los que no, completamos con el
  // promedio de los precios conocidos de ESE producto en otros súpers, así
  // el total sigue sirviendo para comparar aunque no esté 100% confirmado.
  total: number;
  confirmedCount: number;
  totalCount: number;
  complete: boolean;
};

// Antes, la comparación por súper solo mostraba las cadenas con precio
// confirmado de TODOS los productos del carrito (`complete` en cartStats).
// Con Precios Claros eso hace que casi siempre aparezca un solo súper (o
// ninguno) apenas el carrito tiene unos pocos productos, y la "comparación"
// deja de servir para comparar. Acá armamos un total ESTIMADO por cada
// súper que tenga precio confirmado de al menos un producto del carrito,
// rellenando los productos faltantes con el promedio conocido de ese
// producto en otras cadenas. El resultado se ordena de más barato a más
// caro para poder mostrar varios súpers uno al lado del otro.
export function estimatedStoreTotals(
  chosenEntries: ChosenEntry[],
  stores: string[]
): StoreTotal[] {
  return stores
    .map((chain, storeIndex) => {
      let total = 0;
      let confirmedCount = 0;
      chosenEntries.forEach((p) => {
        const known = p.prices[chain];
        if (typeof known === 'number') {
          total += known * p.qty;
          confirmedCount++;
          return;
        }
        const otherValues = Object.values(p.prices || {}).filter(
          (v): v is number => typeof v === 'number'
        );
        const fallback = otherValues.length
          ? otherValues.reduce((a, b) => a + b, 0) / otherValues.length
          : 0;
        total += fallback * p.qty;
      });
      return {
        storeIndex,
        total,
        confirmedCount,
        totalCount: chosenEntries.length,
        complete: chosenEntries.length > 0 && confirmedCount === chosenEntries.length,
      };
    })
    .filter((st) => st.confirmedCount > 0)
    .sort((a, b) => a.total - b.total);
}

// Para cada producto: dónde está más barato y a cuánto.
export function bestPerProduct(chosenEntries: ChosenEntry[]) {
  return chosenEntries.map((p) => {
    const entries = Object.entries(p.prices || {});
    if (!entries.length) return { id: p.id, name: p.name, qty: p.qty, precio: null, store: null };
    const [store, precio] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
    return { id: p.id, name: p.name, qty: p.qty, precio, store };
  });
}

export type GlobalStoreIndex = {
  // % promedio que sale más caro cada súper respecto al más barato,
  // calculado producto por producto. `null` = sin datos de ese súper.
  avgOverpayPct: (number | null)[];
  // cantidad de productos distintos que aportaron al cálculo (con precio
  // confirmado en 2 o más súpers).
  sampleSize: number;
};

// A diferencia de cartStats (que compara SOLO lo que hay en el carrito
// ahora), esto arma un panorama general con TODOS los productos que el
// usuario ya vio alguna vez. Un producto solo entra si tiene precio
// confirmado en 2 o más súpers (si hay uno solo no hay nada que comparar).
export function globalStoreIndex(
  productIndex: Record<string, Product>,
  stores: string[]
): GlobalStoreIndex {
  const sums = stores.map(() => 0);
  const counts = stores.map(() => 0);
  let sampleSize = 0;

  Object.values(productIndex).forEach((p) => {
    const prices = p.prices || {};
    const minP = lowestKnownPrice(prices);
    if (minP === null || Object.keys(prices).length < 2) return;
    sampleSize++;
    stores.forEach((chain, i) => {
      const v = prices[chain];
      if (typeof v !== 'number') return;
      sums[i] += (v / minP - 1) * 100;
      counts[i]++;
    });
  });

  const avgOverpayPct = stores.map((_, i) => (counts[i] ? sums[i] / counts[i] : null));
  return { avgOverpayPct, sampleSize };
}
