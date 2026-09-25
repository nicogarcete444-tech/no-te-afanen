// Utilidades compartidas por las rutas de /app/api/* para no repetir la
// misma validación/rate-limit en cada endpoint.
//
// Mantiene un límite local de respaldo y otro compartido (Upstash Redis o
// Postgres) para que las instancias serverless cuenten las solicitudes en
// conjunto.
import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
const WINDOW_MS = 60_000;

// Tope por defecto (rutas que el usuario dispara de a una: alta premium,
// registrar un producto, etc.).
const MAX_REQUESTS_PER_WINDOW = 30;

// Ojo con bajar estos números: una sola carga de la vidriera dispara una
// búsqueda por cada término del rubro (ver CATALOG_QUERIES_PER_PAGE), y la
// ficha de un producto pide el precio en varias sucursales. Con el tope
// viejo de 30 para todo, la app se bloqueaba a sí misma con 429 apenas
// cambiabas de rubro dos veces seguidas — el usuario veía "Demasiadas
// búsquedas" sin haber hecho nada raro.
export const RATE_LIMITS = {
  productos: 120,
  producto: 120,
  sucursales: 40,
  // Una sola pantalla (rubro o resultado de búsqueda) puede mostrar bien
  // por encima de 60 productos (CATALOG_QUERIES_PER_PAGE x
  // CATALOG_RESULTS_PER_QUERY ronda los 96), y el navegador los pide en
  // lotes de hasta 60 (MAX_PER_REQUEST en lib/productImage.ts): el primer
  // lote ya gastaba TODO este cupo cuando estaba en 60, y el segundo lote
  // (los productos que sobraban) se rechazaba con 429 unos milisegundos
  // después — esos productos se quedaban sin foto aunque las fuentes sí la
  // tuvieran, nunca se les llegó a preguntar. El tope tiene que cubrir más
  // de una pantalla llena por minuto, no solo un lote.
  imagenes: 300,
} as const;

const hits = new Map<string, number[]>();

// Evita que el Map crezca sin límite si entran muchas IPs distintas.
function cleanup(now: number) {
  if (hits.size < 5000) return;
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
  }
}

// Solo se confía en los headers de IP cuando hay un proxy conocido que los
// pone (Vercel, o TRUST_PROXY_HEADERS=1 si corrés detrás de tu propio proxy).
// Fuera de eso cualquiera podría mandar "x-real-ip: <cualquier cosa>" y
// esquivar el límite cambiando el valor en cada request.
const TRUST_PROXY = !!process.env.VERCEL || process.env.TRUST_PROXY_HEADERS === '1';

export function getClientIp(request: Request): string {
  if (!TRUST_PROXY) return 'local';
  // En plataformas que terminan TLS antes de la app, el último salto de
  // X-Forwarded-For es el proxy confiable; el primero lo puede elegir el cliente.
  const real = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-real-ip');
  if (real) return real.split(',').at(-1)?.trim() || 'unknown';
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',').at(-1)?.trim() || 'unknown';
}

// Devuelve true si YA se pasó del límite (o sea: hay que cortar la request).
function isLocallyRateLimited(key: string, max: number, cost: number): boolean {
  const now = Date.now();
  cleanup(now);
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  for (let i = 0; i < cost; i++) timestamps.push(now);
  hits.set(key, timestamps);
  return timestamps.length > max;
}

// Límite compartido entre instancias serverless. Orden de preferencia:
//   1. Upstash Redis (UPSTASH_REDIS_REST_URL/TOKEN): rápido y no toca la base.
//   2. La función consume_api_rate_limit de Postgres (requiere service_role).
// Devuelve true = permitido, false = se pasó, null = no hay backend
// compartido disponible o falló (el que llama decide si falla abierto o
// cerrado).
async function consumeSharedLimit(key: string, max: number, cost: number): Promise<boolean | null> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (upstashUrl && upstashToken) {
    try {
      const windowId = Math.floor(Date.now() / WINDOW_MS);
      const redisKey = `rl:${createHmac('sha256', upstashToken).update(key).digest('hex')}:${windowId}`;
      const res = await fetch(`${upstashUrl.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCRBY', redisKey, cost],
          ['EXPIRE', redisKey, Math.ceil(WINDOW_MS / 1000) * 2],
        ]),
        signal: AbortSignal.timeout(1500),
        cache: 'no-store',
      });
      if (res.ok) {
        const out = (await res.json()) as { result?: unknown }[];
        const count = Number(out?.[0]?.result);
        if (Number.isFinite(count)) return count <= max;
      }
      console.error('[api-rate-limit] upstash respondió', res.status);
    } catch (err) {
      console.error('[api-rate-limit] upstash no disponible:', (err as Error)?.message);
    }
    return null;
  }

  const admin = createAdminClient();
  if (!secret || !admin) return null;

  const keyHash = createHmac('sha256', secret).update(key).digest('hex');
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_key_hash: keyHash,
    p_max_requests: max,
    p_window_seconds: Math.ceil(WINDOW_MS / 1000),
    p_cost: cost,
  });
  if (error) {
    console.error('[api-rate-limit] shared limiter unavailable:', error.message);
    return null;
  }
  return data === true;
}

type RateLimitOptions = {
  // Cuánto "pesa" este pedido (ej: cantidad de productos que dispara). El
  // límite por ventana se mide en unidades de costo, no en requests.
  cost?: number;
  // 'open': si el límite compartido no responde, se deja pasar (usa solo el
  // contador local). Es lo correcto para lecturas públicas cacheables: que
  // Supabase parpadee no debería tirar la búsqueda de productos.
  // 'closed': si no responde, se bloquea. Para rutas que escriben en la base.
  failMode?: 'open' | 'closed';
};

export async function isRateLimited(
  request: Request,
  scope: string,
  max: number = MAX_REQUESTS_PER_WINDOW,
  { cost = 1, failMode = 'closed' }: RateLimitOptions = {}
): Promise<boolean> {
  const ip = getClientIp(request);
  const key = `${scope}:${ip}`;
  const weight = Math.max(1, Math.floor(cost));
  if (isLocallyRateLimited(key, max, weight)) return true;

  const shared = await consumeSharedLimit(key, max, weight);
  if (shared === null) {
    // Sin backend compartido: en producción, las rutas de escritura no
    // degradan a contadores por proceso (las instancias no los comparten).
    return failMode === 'closed' && process.env.NODE_ENV === 'production';
  }
  return shared === false;
}

// --- Validación de parámetros que llegan de la URL (siempre son texto) ---

// Las coordenadas se redondean a 2 decimales (~1 km) en el server: alcanza
// para elegir sucursales cercanas, evita que cada usuario genere una entrada
// de caché distinta (el Data Cache se indexa por URL) y no reenvía la
// ubicación exacta a un tercero, como dice la política de privacidad.
function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseLat(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90 ? roundCoord(n) : null;
}

export function parseLng(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180 ? roundCoord(n) : null;
}

export function parseLimit(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
}

// Texto libre que el usuario tipeó para buscar: recorta longitud y saca
// caracteres de control, pero deja letras/números/acentos/espacios normales.
export function sanitizeQuery(value: string | null, maxLen = 80): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
  return cleaned || null;
}

// El id_producto (EAN) que devuelve Precios Claros: solo dígitos.
export function isValidProductId(value: string | null): value is string {
  return !!value && /^\d{4,20}$/.test(value);
}

// "array_sucursales" viene como una lista de ids compuestos separados por
// coma, ej "15-1-454,20-3-102". Validamos la forma completa antes de
// reenviarlo a la API externa.
export function isValidSucursalesArray(value: string | null): value is string {
  if (!value || value.length > 2000) return false;
  return value.split(',').every((id) => /^\d{1,10}-\d{1,10}-\d{1,10}$/.test(id.trim()));
}
