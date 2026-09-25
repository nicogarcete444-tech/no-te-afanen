import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isRateLimited } from '@/lib/apiSecurity';
import { readJsonBody } from '@/lib/readJsonBody';

// Guarda (o actualiza) la PushSubscription del usuario logueado. Requiere
// sesión: las alertas push, igual que las de bajada de precio in-app, están
// atadas a la cuenta, no a un dispositivo anónimo.
export async function POST(request: NextRequest) {
  // Esta ruta escribe en la base. Sin tope, alguien con una sesión válida
  // (o un script con una cuenta descartable) podía llenar push_subscriptions
  // a fuerza de endpoints inventados.
  if (await isRateLimited(request, 'push-sub', 20)) {
    return NextResponse.json({ error: 'Demasiados pedidos. Esperá un momento.' }, { status: 429 });
  }

  const body = await readJsonBody<{ endpoint?: unknown; p256dh?: unknown; auth?: unknown }>(request, 4096);
  if (!body) return NextResponse.json({ error: 'Body inválido o demasiado grande.' }, { status: 400 });

  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  const p256dh = typeof body?.p256dh === 'string' ? body.p256dh : null;
  const auth = typeof body?.auth === 'string' ? body.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Faltan datos de la suscripción.' }, { status: 400 });
  }

  // El endpoint de push es una URL a la que NUESTRO servidor le va a pegar
  // más tarde (lib/webPush.ts). Guardar ahí lo que mande el cliente sin
  // mirarlo es un SSRF servido en bandeja: bastaba con suscribirse pasando
  // http://169.254.169.254/... (metadatos del cloud) o una IP interna, y el
  // cron terminaba haciendo esa request desde adentro de la infraestructura.
  // Solo se aceptan URLs https de los servicios de push reales.
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'El endpoint de la suscripción no es válido.' }, { status: 400 });
  }

  // Los dos secretos de la suscripción son base64url de largo acotado. Esto
  // evita guardar megabytes de basura en la fila.
  if (!isKeyLike(p256dh, 200) || !isKeyLike(auth, 100)) {
    return NextResponse.json({ error: 'Las claves de la suscripción no son válidas.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Hay que iniciar sesión para activar los avisos push.' }, { status: 401 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });

  if (error) {
    // El mensaje crudo de Postgres nombra tablas, columnas y policies. Al
    // cliente le alcanza con saber que falló.
    console.error('[push/subscribe]', error.message);
    return NextResponse.json({ error: 'No se pudo guardar la suscripción.' }, { status: 500 });
  }
  return NextResponse.json({ subscribed: true });
}

// Dominios de los servicios de push de los navegadores. Si en el futuro
// aparece uno nuevo (o un navegador cambia de host), hay que sumarlo acá o
// las suscripciones de ese navegador se van a rechazar.
const PUSH_HOST_SUFFIXES = [
  '.push.services.mozilla.com', // Firefox
  '.googleapis.com',            // Chrome / Edge / Android (fcm.googleapis.com)
  '.notify.windows.com',        // Edge legacy / Windows
  '.push.apple.com',            // Safari / iOS
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isKeyLike(value: string, maxLen: number): boolean {
  return value.length <= maxLen && /^[A-Za-z0-9_-]+=*$/.test(value);
}
