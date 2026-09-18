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
