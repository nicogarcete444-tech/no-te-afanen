import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// Solo se usa desde el server (cron, con service_role key). Nunca importar
// esto desde un componente de cliente: acá vive la VAPID_PRIVATE_KEY.

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contacto@notegafanen.app';
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type SubRow = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };

async function sendToSubscription(admin: NonNullable<ReturnType<typeof createAdminClient>>, sub: SubRow, body: string) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      timeout: 8000,
    });
    return true;
  } catch (err: any) {
    const statusCode = err?.statusCode;
    // 404/410: el usuario desinstaló la app o borró los datos del navegador.
    // Se borra sola para no seguir gastando intentos con ella.
    if (statusCode === 404 || statusCode === 410) {
      await admin.from('push_subscriptions').delete().eq('id', sub.id);
    }
    // otros errores (red, rate limit del push service) se ignoran acá:
    // no queremos que un envío fallido frene el resto de la tanda.
    return false;
  }
}

// Le manda el push a TODAS las suscripciones de una lista de usuarios con UNA
// sola consulta (antes era un SELECT por usuario) y con concurrencia acotada.
// Si un usuario no tiene ninguna suscripción, simplemente no recibe nada.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !ensureConfigured()) return 0;

  const admin = createAdminClient();
  if (!admin) return 0;

  const subs: SubRow[] = [];
  const unique = Array.from(new Set(userIds));
  // `in` con listas enormes rompe la URL: se consulta en tandas.
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', unique.slice(i, i + 200));
    if (data) subs.push(...(data as SubRow[]));
  }
  if (!subs.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  const CONCURRENCY = 10;
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    const results = await Promise.all(subs.slice(i, i + CONCURRENCY).map((sub) => sendToSubscription(admin, sub, body)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}

// Versión de un solo usuario (se mantiene por compatibilidad).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  return sendPushToUsers([userId], payload);
}
