// Formateador de precios en pesos argentinos. Vive separado de products.ts
// (que además define ~240 búsquedas del catálogo, ~300KB) porque lo importan
// casi todos los componentes de la UI (ProductCard, Header, CartSheet, etc.)
// solo para esto. Antes ese import arrastraba también todo RAW_CATALOG_QUERIES
// aunque el componente no lo usara — separarlo evita esa dependencia
// innecesaria y dejar la puerta abierta a que esos componentes se puedan
// code-splittear sin llevarse el catálogo de arriba.
export function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}
