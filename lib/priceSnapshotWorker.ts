import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUsers } from '@/lib/webPush';
import {
  TRACKED_CHAINS,
  fetchPricesForProduct,
  fetchReferenceStores,
  type ReferenceStore,
} from '@/lib/referenceStores';

// Cuántos productos se procesan por corrida. Antes eran 40 con un cupo total
// de 2.000: cada producto se actualizaba una vez cada ~50 días. Ahora se
// priorizan los que alguien SIGUE (tienen alertas) y el resto se completa con
// los vistos hace poco. El corte real lo pone TIME_BUDGET_MS, no este número.
const MAX_PRODUCTS_PER_RUN = 120;
// Margen bajo maxDuration (60 s) de la ruta del cron: no se lanzan tandas
// nuevas pasado este tiempo, para que la corrida cierre limpia.
const TIME_BUDGET_MS = 45_000;

// Un cambio (para cualquiera de los dos lados) "cuenta" para avisar recién a
// partir de este %, para no generar notificaciones por ruido de centavos
// (redondeos, cambios de oferta por horas) que no representan un cambio real.
const MIN_CHANGE_PCT_TO_NOTIFY = 3;

// Solo se avisa "bajó/subió" si el snapshot con el que se compara es
// reciente. Con uno de hace semanas el aviso mezcla varios cambios y es
// engañoso ("bajó 12 %" cuando en realidad bajó hace tres semanas).
const MAX_PREV_AGE_MS_TO_NOTIFY = 3 * 24 * 60 * 60 * 1000;

// Retención: sin esto price_snapshots y price_drop_notifications crecen sin
// límite.
const SNAPSHOT_RETENTION_DAYS = 180;
const NOTIFICATION_RETENTION_DAYS = 90;
// Productos que nadie mira ni sigue hace tanto tiempo salen de la cola.
const STALE_TRACKED_DAYS = 90;

export type SnapshotRunResult = {
  processed: number;
  snapshotsInserted: number;
  notificationsSent: number;
  purged: { snapshots: number; notifications: number; tracked: number };
  errors: string[];
};

function emptyResult(errors: string[] = []): SnapshotRunResult {
  return {
    processed: 0,
    snapshotsInserted: 0,
    notificationsSent: 0,
    purged: { snapshots: 0, notifications: 0, tracked: 0 },
    errors,
  };
}

const daysAgoIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// Cola de la corrida: primero los productos seguidos (con alertas), del que
// hace más que no se actualiza; después el resto de los vistos hace poco.
async function pickQueue(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: watched } = await admin.from('price_alerts').select('ean').limit(5000);
  const watchedEans = Array.from(new Set((watched || []).map((r) => r.ean as string)));

  const queue: { ean: string; nombre: string | null }[] = [];

  for (let i = 0; i < watchedEans.length && queue.length < MAX_PRODUCTS_PER_RUN; i += 200) {
    const { data } = await admin
      .from('tracked_products')
      .select('ean, nombre, last_snapshot_at')
      .in('ean', watchedEans.slice(i, i + 200));
    queue.push(...(data || []).map((r) => ({ ean: r.ean as string, nombre: (r.nombre as string | null) ?? null })));
  }
  // Los seguidos más atrasados primero (el orden dentro de cada tanda de 200
  // no es global, alcanza para que ninguno quede sin turno).
  const seen = new Set(queue.map((q) => q.ean));

  if (queue.length < MAX_PRODUCTS_PER_RUN) {
    const { data, error } = await admin
      .from('tracked_products')
      .select('ean, nombre')
      .gte('last_seen_at', daysAgoIso(30))
      .order('last_snapshot_at', { ascending: true, nullsFirst: true })
      .limit(MAX_PRODUCTS_PER_RUN);
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      if (queue.length >= MAX_PRODUCTS_PER_RUN) break;
      if (seen.has(r.ean as string)) continue;
      seen.add(r.ean as string);
      queue.push({ ean: r.ean as string, nombre: (r.nombre as string | null) ?? null });
    }
  }
  return queue.slice(0, MAX_PRODUCTS_PER_RUN);
}

async function purgeOldData(admin: NonNullable<ReturnType<typeof createAdminClient>>, errors: string[]) {
  const purged = { snapshots: 0, notifications: 0, tracked: 0 };

  const snaps = await admin
    .from('price_snapshots')
    .delete({ count: 'exact' })
    .lt('captured_at', daysAgoIso(SNAPSHOT_RETENTION_DAYS));
  if (snaps.error) errors.push(`retención snapshots: ${snaps.error.message}`);
  else purged.snapshots = snaps.count ?? 0;

  const notes = await admin
    .from('price_drop_notifications')
    .delete({ count: 'exact' })
    .lt('created_at', daysAgoIso(NOTIFICATION_RETENTION_DAYS));
  if (notes.error) errors.push(`retención notificaciones: ${notes.error.message}`);
  else purged.notifications = notes.count ?? 0;

  // Productos abandonados: nadie los abrió hace mucho. Los que tienen alertas
  // se conservan siempre. Se calcula en el server para no depender de un
  // NOT IN gigante en la URL.
  const { data: stale } = await admin
    .from('tracked_products')
    .select('ean')
    .lt('last_seen_at', daysAgoIso(STALE_TRACKED_DAYS))
    .limit(500);
  const staleEans = (stale || []).map((r) => r.ean as string);
  if (staleEans.length) {
    const { data: withAlerts } = await admin.from('price_alerts').select('ean').in('ean', staleEans);
    const keep = new Set((withAlerts || []).map((r) => r.ean as string));
    const toDelete = staleEans.filter((e) => !keep.has(e));
    if (toDelete.length) {
      const del = await admin.from('tracked_products').delete({ count: 'exact' }).in('ean', toDelete);
      if (del.error) errors.push(`retención productos: ${del.error.message}`);
      else purged.tracked = del.count ?? 0;
    }
  }
  return purged;
}

// Corre una tanda del cron: toma la cola priorizada, consulta Precios Claros
// para cada producto y guarda lo que encuentre. Un producto que falla no
// frena a los demás — se junta el error y se sigue.
export async function runPriceSnapshotBatch(): Promise<SnapshotRunResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  if (!admin) return emptyResult(['Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.']);

  const errors: string[] = [];
  let products: { ean: string; nombre: string | null }[];
  try {
    products = await pickQueue(admin);
  } catch (e) {
    return emptyResult([`No se pudo armar la cola: ${e}`]);
  }

  let referenceStores: ReferenceStore[] = [];
  if (products.length) {
    try {
      referenceStores = await fetchReferenceStores();
    } catch (e) {
      return emptyResult([`No se pudieron traer sucursales de referencia: ${e}`]);
    }
    if (!referenceStores.length) {
      return emptyResult(['No se encontró ninguna cadena conocida cerca del punto de referencia.']);
    }
  }

  let snapshotsInserted = 0;
  let notificationsSent = 0;
  let processed = 0;
  const now = new Date().toISOString();

  async function processProduct({ ean, nombre }: { ean: string; nombre: string | null }) {
    try {
      // Precios de la corrida ANTERIOR para este producto, POR CADENA. Todas
      // las filas de una corrida comparten captured_at, así que nos quedamos
      // solo con las de la fecha más reciente.
      const { data: prevRows } = await admin!
        .from('price_snapshots')
        .select('chain, precio, captured_at')
        .eq('ean', ean)
        .order('captured_at', { ascending: false })
        .limit(TRACKED_CHAINS.length);
      const latest = prevRows?.[0]?.captured_at as string | undefined;
      const prevByChain = new Map<string, number>();
      (prevRows || []).forEach((r) => {
        if (r.captured_at === latest) prevByChain.set(r.chain as string, Number(r.precio));
      });
      const prevIsRecent = !!latest && Date.now() - new Date(latest).getTime() <= MAX_PREV_AGE_MS_TO_NOTIFY;

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
          // las dos corridas (si la más barata deja de informar el producto un
          // día, no es una "suba"). Y solo si el snapshot previo es reciente.
          const common = prices.filter((p) => prevByChain.has(p.chain));
          if (prevIsRecent && common.length) {
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
                  // Push real además del aviso in-app, en UNA consulta de
                  // suscripciones para todos los que siguen el producto.
                  await sendPushToUsers(
                    watchers.map((w) => w.user_id as string),
                    {
                      title: direction === 'bajo' ? 'Bajó de precio' : 'Subió de precio',
                      body: `${nombre || ean}: ${direction === 'bajo' ? '-' : '+'}${pctAbs}% (referencia CABA)`,
                      url: '/',
                      tag: `price-change-${ean}`,
                    }
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

  // De a 4 productos en paralelo, cortando cuando se acaba el presupuesto de
  // tiempo: lo que no entra queda al principio de la cola de la próxima
  // corrida (last_snapshot_at más viejo).
  const CONCURRENCY = 4;
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processProduct));
    processed += batch.length;
  }

  const purged = await purgeOldData(admin, errors);
  return { processed, snapshotsInserted, notificationsSent, purged, errors };
}
