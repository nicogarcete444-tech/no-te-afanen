// Lo mínimo que necesita la PORTADA para arrancar. Vive aparte de
// ./products (~300 KB de texto con ~1700 búsquedas de catálogo) para que ese
// archivo no entre en el bundle inicial: el catálogo completo se descarga
// recién cuando hace falta (elegir un rubro, o el barrido de ofertas que
// corre después de pintar la portada). Ver StoreApp.

// Vidriera de la página principal (rubro "Todos", sin buscar nada). Son 10
// productos bien variados — uno de cada rubro (Lácteos, Almacén, Limpieza,
// Bebidas, Perfumería, Frescos, Congelados, Mascotas) más dos
// básicos extra — para que la portada cargue rápido y muestre variedad real
// sin amontonar. El catálogo completo se sigue usando al elegir un rubro
// puntual en los chips o al buscar algo.
export const HOME_TEASER_QUERIES: { category: string; query: string }[] = [
  { category: 'Lácteos', query: 'leche entera' },
  { category: 'Lácteos', query: 'huevos' },
  { category: 'Almacén', query: 'yerba mate' },
  { category: 'Almacén', query: 'arroz' },
  { category: 'Limpieza', query: 'papel higienico' },
  { category: 'Bebidas', query: 'agua mineral' },
  { category: 'Perfumería', query: 'shampoo' },
  { category: 'Carnes', query: 'pollo' },
  { category: 'Congelados', query: 'hamburguesa congelada' },
  { category: 'Mascotas', query: 'alimento balanceado para perros' },
];

// Cuántos productos se muestran en la vidriera de la página principal.
export const HOME_TEASER_LIMIT = 10;

// Cuántos resultados le pedimos a Precios Claros por cada búsqueda de la
// vidriera.
export const CATALOG_RESULTS_PER_QUERY = 8;

// En la portada pedimos varios resultados por búsqueda (no 1 solo, ni los 8
// del catálogo completo): con 1 solo, si justo ESE producto no tenía foto
// cargada en las bases (pasa seguido, son crowdsourced), la portada quedaba
// con el ícono gris de respaldo. Con 4 candidatos por rubro, StoreApp elige
// el primero que sí tenga foto (pickHomeTeaserWithPhotos) y si ninguno tiene,
// recién ahí cae al primero sin foto — sigue siendo un solo producto por
// rubro, no se llena con marcas repetidas.
export const HOME_TEASER_RESULTS_PER_QUERY = 4;
