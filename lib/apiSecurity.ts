import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Utilidades compartidas por las rutas de /app/api/* para no repetir la
// misma validación/rate-limit en cada endpoint.
//
// Nota sobre el rate limit: al correr en funciones serverless (Vercel), cada
// instancia tiene su propia memoria, así que esto NO es un límite global
// estricto (un atacante distribuido podría esquivarlo pegándole a distintas
// instancias). Aun así frena de forma efectiva el abuso más común (un
// script pegándole en loop desde una sola conexión) y no depende de
// infraestructura extra. Si en algún momento hace falta un límite global
// real, lo ideal es sumar Upstash Ratelimit o el rate limiting nativo de
// Vercel Firewall.
const WINDOW_MS = 60_000;

// Tope por defecto (rutas que el usuario dispara de a una: alta premium,
// registrar un producto, etc.).
const MAX_REQUESTS_PER_WINDOW = 30;

export const RATE_LIMITS = {
  productos: 120,
  producto: 120,
  sucursales: 40,
  // Cada pedido trae hasta 60 fotos de una, así que con pocos alcanza.
  imagenes: 60,
} as const;

// Límite GLOBAL con Upstash Redis (compartido entre todas las instancias
// serverless). Si faltan las env vars, cae a memoria local por instancia.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<number, Ratelimit>();

function getLimiter(max: number): Ratelimit | null {
  if (!redis) return null;
  let l = limiters.get(max);
  if (!l) {
    l = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, '60 s'),
      prefix: 'nta:rl',
    });
    limiters.set(max, l);
  }
  return l;
}

const hits = new Map<string, number[]>();

function localIsLimited(key: string, max: number): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(key, timestamps);
  if (hits.size > 5000) {
    for (const [k, ts] of hits) {
      if (!ts.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  return timestamps.length > max;
}

// Ojo: el PRIMER valor de x-forwarded-for lo puede mandar el cliente (se
// puede falsear). La plataforma agrega la IP real AL FINAL de la lista,
// así que se toma el último valor.
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

// Devuelve true si YA se pasó del límite (o sea: hay que cortar la request).
export async function isRateLimited(
  key: string,
  max: number = MAX_REQUESTS_PER_WINDOW
): Promise<boolean> {
  const limiter = getLimiter(max);
  if (!limiter) return localIsLimited(key, max);
  try {
    const { success } = await limiter.limit(key);
    return !success;
  } catch {
    // Si Redis falla, no bloqueamos a los usuarios: usamos memoria local.
    return localIsLimited(key, max);
  }
}

// --- Validación de parámetros que llegan de la URL (siempre son texto) ---

export function parseLat(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90 ? n : null;
}

export function parseLng(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
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
