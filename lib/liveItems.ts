// Tipos y helpers puros de los productos que devuelve Precios Claros.
//
// Antes esto vivía adentro de components/LiveResults.tsx, junto a un
// componente de UI que ya no se usa en ningún lado (la vidriera y la
// búsqueda pasaron a CategoryProductList). Al quedar acá:
//   - lib/ no importa más de components/ (antes catalogCache.ts hacía
//     justo eso, que es un import al revés),
//   - se borró ~200 líneas de componente muerto que igual entraban al
//     bundle del cliente.

export type LiveItem = {
  nombre?: string;
  marca?: string;
  presentacion?: string;
  // Nombres reales que devuelve la API de Precios Claros para /productos.
  cantSucursalesDisponible?: number;
  precioMax?: number;
  precioMin?: number;
  // Nombres alternativos que puede traer /producto (por id puntual). Se
  // dejan por compatibilidad, aunque hoy no vienen en /productos.
  cant_sucursales_disponible?: number;
  precio_lista?: number;
  precio_referencia?: number;
  precio_promocional?: number;
  precio_oferta?: number;
  precio_unitario?: number;
  precio?: number;
  // El campo con el código de barras puede venir con distintos nombres
  // según el endpoint de Precios Claros que responda.
  id?: string | number;
  id_producto?: string | number;
  codigo_barras?: string | number;
  ean?: string | number;
  // Campo propio (no viene de Precios Claros): con qué rubro lo etiquetamos
  // al traerlo para la vidriera inicial, para poder filtrar por categoría.
  _cat?: string;
};

const PRICE_FIELDS: (keyof LiveItem)[] = [
  'precioMin', 'precioMax',
  'precio_lista', 'precio_referencia', 'precio_promocional',
  'precio_oferta', 'precio_unitario', 'precio',
];

export function lowestPrice(item: LiveItem): number {
  const vals = PRICE_FIELDS.map((f) => item[f]).filter(
    (v): v is number => typeof v === 'number' && v > 0
  );
  return vals.length ? Math.min(...vals) : 0;
}

export function extractEan(item: LiveItem): string | null {
  const raw = item.id ?? item.id_producto ?? item.codigo_barras ?? item.ean;
  return raw === undefined || raw === null ? null : String(raw);
}

// Compara dos códigos de barras "a lo mismo": un mismo producto puede llegar
// como EAN-13 con el 0 de relleno adelante (ej. "0784070234567") o como
// UPC-A de 12 dígitos sin ese cero (ej. "784070234567"), según de dónde haya
// salido el número. Si comparábamos los strings tal cual, muchos productos
// escaneados no "matcheaban" con el resultado que sí traía Precios Claros
// aunque fueran el mismo artículo, y el usuario terminaba viendo la lista
// completa de resultados en vez del producto puntual (o directamente ningún
// nombre reconocible). Sacando los ceros de relleno de la izquierda, ambos
// formatos quedan iguales.
export function normalizeEan(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const trimmed = digits.replace(/^0+/, '');
  return trimmed || '0';
}

// Id estable de un producto dentro del carrito. Se arma una sola vez acá
// para que la vidriera, la ficha y el carrito usen exactamente el mismo
// formato ("live:<ean>"), que es del que después lib/productImage.ts saca
// el EAN para buscar la foto.
export function cartIdFor(item: LiveItem): string {
  const ean = extractEan(item);
  return 'live:' + (ean || `${item.nombre}|${item.presentacion}|${item.marca}`.toLowerCase());
}

// Precios Claros no siempre trae el campo "nombre" completo para cada
// registro (a veces solo viene marca + presentación). Antes, en ese caso,
// se mostraba lisa y llanamente "Producto" — un cartel vacío que no ayuda a
// reconocer qué es lo que se escaneó. Armamos el mejor nombre posible con lo
// que sí tengamos, y "Producto" queda como último recurso si no hay nada de
// nada.
export function displayNameFor(item: LiveItem): string {
  const nombre = (item.nombre || '').trim();
  if (nombre) return (item.marca ? item.marca + ' — ' : '') + nombre;

  const presentacion = (item.presentacion || '').trim();
  if (item.marca && presentacion) return `${item.marca} — ${presentacion}`;
  if (item.marca) return item.marca;
  if (presentacion) return presentacion;
  return 'Producto';
}

export type SortOrder = 'relevancia' | 'price_asc' | 'price_desc';

// Ordena los grupos ya armados por precio. Los productos sin precio
// detectado (precio === 0, "s/d") siempre quedan al final, sea cual sea
// el orden elegido, para no ensuciar el top de la lista con datos vacíos.
export function sortGroups<T extends { precio: number }>(groups: T[], order: SortOrder): T[] {
  if (order === 'relevancia') return groups;
  const withPrice = groups.filter((g) => g.precio > 0);
  const withoutPrice = groups.filter((g) => !(g.precio > 0));
  withPrice.sort((a, b) => (order === 'price_asc' ? a.precio - b.precio : b.precio - a.precio));
  return [...withPrice, ...withoutPrice];
}

export function groupLiveItems(items: LiveItem[]) {
  // La API puede traer varios registros del mismo artículo con distintos
  // campos de precio. La marca es parte de la identidad del producto: sin
  // incluirla, variantes distintas del mismo tipo de producto se pisan entre sí.
  const grouped = new Map<string, { item: LiveItem; precio: number }>();
  items.forEach((item) => {
    const key = (item.nombre || 'producto').trim().toLowerCase()
      + '|' + (item.presentacion || '').trim().toLowerCase()
      + '|' + (item.marca || '').trim().toLowerCase();
    const precio = lowestPrice(item);
    const existing = grouped.get(key);
    if (!existing || (precio && precio < existing.precio) || (!existing.precio && precio)) {
      grouped.set(key, { item, precio });
    }
  });
  return [...grouped.values()];
}
