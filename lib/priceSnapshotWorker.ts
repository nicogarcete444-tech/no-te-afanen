import { PRECIOS_CLAROS_BASE, PRECIOS_CLAROS_HEADERS } from '@/lib/preciosClarosBase';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { isCarrefour, isChangomas, isCoto, isDia, isDisco, isJumbo } from '@/lib/chains';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/webPush';

// Punto de referencia para ubicar sucursales: Obelisco (CABA). El objetivo
// del historial no es "el precio en la sucursal exacta del usuario" (eso ya
// lo resuelve la búsqueda en vivo con geolocalización real) sino "cómo
// evolucionó el precio de este producto en general" — un punto fijo y
// estable en el tiempo es justamente lo que hace comparables los snapshots
// de un día con los del día siguiente.
const REFERENCE_LAT = -34.6037;
const REFERENCE_LNG = -58.3816;

// Mismas 6 cadenas para las que StoreLogo.tsx tiene logo propio: son las de
// mayor cobertura nacional en Precios Claros, así que dan la serie más
// completa y comparable día a día.
const TRACKED_CHAINS: { test: (n: string) => boolean; label: string }[] = [
  { test: isCarrefour, label: 'Carrefour' },
  { test: isChangomas, label: 'Changomas' },
  { test: isDisco, label: 'Disco' },
  { test: isJumbo, label: 'Jumbo' },
  { test: isCoto, label: 'Coto' },
  // isDia matchea la PALABRA: el `includes('dia')` de antes agarraba también
  // a "Diarco" y guardaba sus precios como si fueran de Día.
  { test: isDia, label: 'Dia' },
];

const MAX_PRODUCTS_PER_RUN = 40; // no golpear Precios Claros de más en una sola corrida

// Un cambio (para cualquiera de los dos lados) "cuenta" para avisar recién a
// partir de este %, para no generar notificaciones por ruido de centavos
// (redondeos, cambios de oferta por horas) que no representan un cambio real.
const MIN_CHANGE_PCT_TO_NOTIFY = 3;

type ReferenceStore = { chainLabel: string; sucursalId: string };

async function fetchReferenceStores(): Promise<ReferenceStore[]> {
  const url = `${PRECIOS_CLAROS_BASE}/sucursales?lat=${REFERENCE_LAT}&lng=${REFERENCE_LNG}&limit=200`;
  const res = await fetchWithTimeout(url, { headers: PRECIOS_CLAROS_HEADERS, cache: 'no-store' }, 10_000);
  if (!res.ok) throw new Error('sucursales HTTP ' + res.status);
  const data = await res.json();
  const list: any[] = data?.sucursales || (Array.isArray(data) ? data : []);

  const found: ReferenceStore[] = [];
  for (const chain of TRACKED_CHAINS) {
    const match = list.find((s) => s?.banderaDescripcion && chain.test(String(s.banderaDescripcion)));
    const id = match?.id;
    if (id) found.push({ chainLabel: chain.label, sucursalId: String(id) });
  }
  return found;
}

function toNum(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) && n > 0 ? n : undefined;
}

async function fetchPricesForProduct(
  ean: string,
  stores: ReferenceStore[]
): Promise<{ chain: string; precio: number; precioLista?: number }[]> {
  const ids = stores.map((s) => s.sucursalId).join(',');
  const url =
    `${PRECIOS_CLAROS_BASE}/producto?id_producto=${encodeURIComponent(ean)}` +
    `&array_sucursales=${encodeURIComponent(ids)}&limit=${stores.length}`;
  const res = await fetchWithTimeout(url, { headers: PRECIOS_CLAROS_HEADERS, cache: 'no-store' }, 8_000);
  if (!res.ok) throw new Error('producto HTTP ' + res.status);
  const data = await res.json();

  const out: { chain: string; precio: number; precioLista?: number }[] = [];
  for (const suc of data?.sucursales || []) {
    if (!suc || suc.message) continue;
    const composite = `${suc.comercioId}-${suc.banderaId}-${suc.id}`;
    const store = stores.find((s) => s.sucursalId === composite);
    if (!store) continue;

    const precioLista = toNum(suc.preciosProducto?.precioLista);
    const promo = [toNum(suc.preciosProducto?.promo1?.precio), toNum(suc.preciosProducto?.promo2?.precio)].filter(
      (n): n is number => typeof n === 'number'
    );
    // El más bajo entre promos y lista: una "promo" más cara que la lista
    // (pasa con promos por cantidad) no es el precio al que se compra.
    const candidatos = [...promo, ...(precioLista ? [precioLista] : [])];
    const precio = candidatos.length ? Math.min(...candidatos) : undefined;
    if (typeof precio !== 'number') continue;

    out.push({ chain: store.chainLabel, precio, precioLista });
  }
  return out;
}

export type SnapshotRunResult = {
  processed: number;
  snapshotsInserted: number;
  notificationsSent: number;
  errors: string[];
};

// Corre una tanda del cron: trae hasta MAX_PRODUCTS_PER_RUN productos
// (los que hace más tiempo que no se les toma una foto de precio),
// consulta Precios Claros para cada uno y guarda lo que encuentre.
// Un producto que falla no frena a los demás — se junta el error y se sigue.
export async function runPriceSnapshotBatch(): Promise<SnapshotRunResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { processed: 0, snapshotsInserted: 0, notificationsSent: 0, errors: ['Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.'] };
  }

  const { data: products, error: selectError } = await admin
    .from('tracked_products')
    .select('ean, nombre')
    .order('last_snapshot_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PRODUCTS_PER_RUN);

  if (selectError) {
    return { processed: 0, snapshotsInserted: 0, notificationsSent: 0, errors: [selectError.message] };
  }
  if (!products || products.length === 0) {
    return { processed: 0, snapshotsInserted: 0, notificationsSent: 0, errors: [] };
  }

  const errors: string[] = [];
  let referenceStores: ReferenceStore[];
  try {
    referenceStores = await fetchReferenceStores();
  } catch (e) {
    return { processed: 0, snapshotsInserted: 0, notificationsSent: 0, errors: [`No se pudieron traer sucursales de referencia: ${e}`] };
  }
  if (!referenceStores.length) {
    return { processed: 0, snapshotsInserted: 0, notificationsSent: 0, errors: ['No se encontró ninguna cadena conocida cerca del punto de referencia.'] };
  }

  let snapshotsInserted = 0;
  let notificationsSent = 0;
  const now = new Date().toISOString();

  async function processProduct({ ean, nombre }: { ean: string; nombre: string | null }) {
    try {
      // Precios de la corrida ANTERIOR para este producto, POR CADENA. Todas
      // las filas de una corrida comparten captured_at, así que nos quedamos
      // solo con las de la fecha más reciente (antes se tomaban las últimas
      // 6 filas a secas: si la corrida anterior había encontrado el producto
      // en 3 cadenas, las otras 3 filas eran de una corrida todavía más
      // vieja y se mezclaban).
      const { data: prevRows } = await admin!
        .from('price_snapshots')
        .select('chain, precio, captured_at')
        .eq('ean', ean)
        .order('captured_at', { ascending: false })
        .limit(TRACKED_CHAINS.length);
      const latest = prevRows?.[0]?.captured_at;
      const prevByChain = new Map<string, number>();
      (prevRows || []).forEach((r) => {
        if (r.captured_at === latest) prevByChain.set(r.chain as string, Number(r.precio));
      });

      const prices = await fetchPricesForProduct(ean, referenceStores);
      if (prices.length) {
        const { error: insertError } = await admin!.from('price_snapshots').insert(
          prices.map((p) => ({
            ean,
            chain: p.chain,
            precio: p.precio,
            precio_lista: p.precioLista ?? null,
            captured_at: now,
          }))
        );
        if (insertError) {
          errors.push(`${ean}: ${insertError.message}`);
        } else {
          snapshotsInserted += prices.length;

          // Se compara el mejor precio SOLO entre las cadenas que aparecen en
          // las dos corridas. Antes se comparaba el mínimo de cada corrida a
          // secas: si la cadena más barata dejaba de informar el producto un
          // día, el "mejor precio" subía y todos los que seguían el producto
          // recibían un aviso de "Subió de precio" que no era cierto.
          const common = prices.filter((p) => prevByChain.has(p.chain));
          if (common.length) {
            const prevBest = Math.min(...common.map((p) => prevByChain.get(p.chain)!));
            const newBest = Math.min(...common.map((p) => p.precio));
            const pctChange = prevBest ? Math.round((1 - newBest / prevBest) * 100) : 0;
            // pctChange > 0 es bajada (newBest menor que antes); < 0 es subida.
            const changedEnough = prevBest > 0 && Math.abs(pctChange) >= MIN_CHANGE_PCT_TO_NOTIFY;
            const direction: 'bajo' | 'subio' = pctChange > 0 ? 'bajo' : 'subio';

            if (changedEnough) {
              const { data: watchers } = await admin!.from('price_alerts').select('user_id').eq('ean', ean);
              if (watchers?.length) {
                const pctAbs = Math.abs(pctChange);
                const { error: notifyError } = await admin!.from('price_drop_notifications').insert(
                  watchers.map((w) => ({
                    user_id: w.user_id,
                    ean,
                    nombre,
                    old_price: prevBest,
                    new_price: newBest,
                    pct_drop: pctAbs,
                    direction,
                  }))
                );
                if (notifyError) {
                  errors.push(`${ean} (notificaciones): ${notifyError.message}`);
                } else {
                  notificationsSent += watchers.length;
                  // Push real además del aviso in-app: si el usuario no tiene
                  // ninguna suscripción guardada, sendPushToUser no hace nada
                  // (no rompe el flujo si todavía no activó los avisos).
                  await Promise.all(
                    watchers.map((w) =>
                      sendPushToUser(w.user_id, {
                        title: direction === 'bajo' ? 'Bajó de precio' : 'Subió de precio',
                        body: `${nombre || ean}: ${direction === 'bajo' ? '-' : '+'}${pctAbs}% (referencia CABA)`,
                        url: '/',
                        tag: `price-change-${ean}`,
                      })
                    )
                  );
                }
              }
            }
          }
        }
      }
      // Se actualiza last_snapshot_at aunque no haya precios encontrados,
      // para no reintentar el mismo producto sin precio en cada corrida y
      // dejar lugar a que le toque el turno a otros productos de la cola.
      await admin!.from('tracked_products').update({ last_snapshot_at: now }).eq('ean', ean);
    } catch (e) {
      errors.push(`${ean}: ${e}`);
    }
  }

  // De a 4 productos en paralelo. Antes era uno por vez, con 2-3 pedidos de
  // red cada uno y SIN timeout: 40 productos seguidos no entraban en el
  // tiempo de una función serverless, la corrida se cortaba a la mitad y los
  // productos del final de la cola no se procesaban nunca.
  const CONCURRENCY = 4;
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    await Promise.all(products.slice(i, i + CONCURRENCY).map(processProduct));
  }

  return { processed: products.length, snapshotsInserted, notificationsSent, errors };
}
