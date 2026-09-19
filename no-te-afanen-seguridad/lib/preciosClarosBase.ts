import { fetchWithTimeout } from './fetchWithTimeout';

// Deriva la URL base ("…/prod") de la misma variable de entorno que ya usa
// /api/productos, para no pedirle a Nico que configure una env var nueva.
const PRODUCTOS_URL =
  process.env.PRECIOS_CLAROS_API_URL ||
  'https://d3e6htiiul5ek9.cloudfront.net/prod/productos';

export const PRECIOS_CLAROS_BASE = PRODUCTOS_URL.replace(/\/productos\/?$/, '');

// La API bloquea (403) los pedidos que no parecen venir de un navegador real
// entrando desde preciosclaros.gob.ar. Estos headers imitan esa llamada.
export const PRECIOS_CLAROS_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://preciosclaros.gob.ar/',
  Origin: 'https://preciosclaros.gob.ar',
};

// Antes cada ruta (/api/productos, /api/producto, /api/sucursales) hacía su
// propio fetch() directo a Precios Claros, sin timeout ni reintento: si esa
// API (que es del Estado y no siempre anda fina) tardaba mucho o daba un
// error de servidor pasajero, la búsqueda quedaba colgada hasta el límite
// de la función serverless y el usuario terminaba viendo "no encontramos
// productos" sin que hubiera realmente ninguno. Este helper centraliza:
//   1. un timeout razonable, para fallar rápido en vez de colgarse,
//   2. UN reintento (con una pausa corta) pero SOLO ante error de red o 5xx
//      — un 4xx (parámetros inválidos) no se arregla reintentando.
export async function fetchPreciosClaros(
  url: string,
  revalidateSeconds: number,
  { timeoutMs = 7000, retries = 1 }: { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: PRECIOS_CLAROS_HEADERS, next: { revalidate: revalidateSeconds } },
        timeoutMs
      );
      if (res.ok || res.status < 500 || attempt === retries) return res;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
    }
    // Pausa corta antes de reintentar: si la API está teniendo un mal
    // momento, pegarle de nuevo al instante no suele ayudar.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  // No debería llegar acá (el loop siempre retorna o lanza), pero TypeScript
  // necesita un camino de salida explícito.
  throw lastErr ?? new Error('No se pudo contactar a Precios Claros.');
}
