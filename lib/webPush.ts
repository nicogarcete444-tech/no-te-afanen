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

// Le manda el push a TODAS las suscripciones guardadas de un usuario (puede
// tener varias: celu, notebook, etc). Si una suscripción quedó vieja/inválida
// (410/404 — el usuario desinstaló la app o borró los datos del navegador),
// se borra sola de la tabla para no seguir gastando intentos con ella.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const admin = createAdminClient();
  if (!admin) return 0;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs?.length) return 0;

  let sent = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
      } catch (err: any) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
        // otros errores (red, rate limit del push service) se ignoran acá:
        // no queremos que un envío fallido frene el resto de la tanda.
      }
    })
  );

  return sent;
}
