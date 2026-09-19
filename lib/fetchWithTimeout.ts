// Antes, todos los fetch() a APIs externas (Precios Claros, Open * Facts,
// MercadoLibre) no tenían ningún límite de tiempo propio: si esa API se
// colgaba (no respondía nada, ni siquiera un error), nuestra request se
// quedaba esperando hasta que la mate el timeout de la función serverless
// — y ahí sí, sin devolver un error controlado, el usuario ve la app
// "trabada" o, en el peor caso, la tanda entera de productos/fotos que
// dependía de esa respuesta se pierde. AbortSignal.timeout corta el pedido
// a los N ms y lo convierte en un error normal que sí podemos manejar
// (mostrar "no respondió", reintentar, o seguir con el resto de la tanda).
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
