// Rubros, sus colores y qué rubros no arman vidriera automática. Vive
// separado de products.ts (que además define ~240 búsquedas del catálogo,
// ~300KB) porque lo importan componentes chicos (SavingsHistoryModal,
// ProductDetailSheet, CartSheet, CategoryProductList) que solo necesitan
// esto, no el catálogo completo.

// Verdulería se sacó de la lista de rubros (chips y píldoras de filtro). Ojo: sus
// búsquedas en RAW_CATALOG_QUERIES (en products.ts) NO se borraron, porque el
// buscador las usa para las búsquedas relacionadas y los alias
// (relatedSearches.ts y searchAliases.ts).
export const CATEGORIES = ['Todos', 'Lácteos', 'Almacén', 'Carnes', 'Limpieza', 'Bebidas', 'Perfumería', 'Frescos', 'Congelados', 'Mascotas'];

// Rubros que NO arman vidriera automática (las ~12 búsquedas fijas de
// catalogQueriesFor). Verdulería es el caso: la fruta y verdura suelta casi
// nunca tiene código de barra (EAN), que es sobre lo que está armada Precios
// Claros — cada tanda de "cebolla por kilo", "tomate por kilo", etc. volvía
// vacía casi siempre, no por una falla pasajera sino porque ese dato
// directamente no está en la fuente. En vez de mostrar "0 productos" cada
// vez, el rubro queda disponible solo por búsqueda (el buscador principal,
// que además prueba términos relacionados y aproximados) y por escaneo de
// código de barra — los productos envasados de verdulería (bolsas de
// ensalada, verdura congelada en el momento, etc.) sí pueden tener EAN y
// aparecer ahí.
export const CATALOG_BROWSE_DISABLED: string[] = ['Verdulería'];

export const CATEGORY_COLORS: Record<string, [string, string]> = {
  'Lácteos': ['#7FC4F5', '#2E74C9'],
  'Almacén': ['#FFC978', '#DD8A1E'],
  'Limpieza': ['#8FE0B8', '#279B63'],
  'Bebidas': ['#FF9C89', '#D94E38'],
  'Perfumería': ['#E3A6E0', '#9C3FA0'],
  'Carnes': ['#F0A3AE', '#B8384F'],
  'Frescos': ['#B7E39A', '#5C9E3A'],
  'Verdulería': ['#A9E06B', '#5B8C1E'],
  'Congelados': ['#9FD8F0', '#2B7FA3'],
  'Mascotas': ['#D8B48C', '#8B5E34'],
};
