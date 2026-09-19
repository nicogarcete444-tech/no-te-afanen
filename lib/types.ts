export type Product = {
  name: string;
  category: string;
  // Precio confirmado por CADENA, indexado por el nombre de la cadena tal
  // como lo devuelve Precios Claros ("Coto", "Supermercados DIA", …).
  //
  // Antes esto era un array `(number | null)[]` alineado por POSICIÓN con la
  // lista de súpers cercanos. Eso tenía un problema serio de exactitud: la
  // lista de súpers depende de dónde estás parado, así que un carrito armado
  // en casa y abierto desde el laburo quedaba con los precios corridos de
  // lugar — le atribuía a Coto el precio de Carrefour. Con un diccionario por
  // nombre de cadena, el precio siempre queda pegado al súper al que
  // realmente corresponde.
  //
  // Una cadena que no aparece en el diccionario es una cadena para la que
  // Precios Claros no informó precio de este producto. No se inventa nada.
  prices: Record<string, number>;
  // Código de barras, cuando lo tenemos. Es lo que permite volver a pedir el
  // precio actualizado más adelante en vez de quedarnos con la foto vieja.
  ean?: string | null;
  // Cuándo se trajeron estos precios (Date.now()). Sirve para avisarle a la
  // persona qué tan fresco es lo que está viendo y para saber qué refrescar.
  pricedAt?: number;
  icon: string; // paths SVG internos
};

export type CartMap = Record<string, number>; // id del producto -> cantidad

// Precio más bajo entre las cadenas que sí informaron precio, o null.
export function lowestKnownPrice(prices: Record<string, number>): number | null {
  const values = Object.values(prices || {});
  return values.length ? Math.min(...values) : null;
}

// Precio más alto entre las cadenas que sí informaron precio, o null.
export function highestKnownPrice(prices: Record<string, number>): number | null {
  const values = Object.values(prices || {});
  return values.length ? Math.max(...values) : null;
}
