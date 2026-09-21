// Palabras de todos los días -> lo que realmente existe cargado en Precios
// Claros.
//
// Precios Claros no tiene "comida de gatos", "papas fritas" o "asado" como
// producto: tiene "alimento para gatos adultos", "papas fritas lays", "tira
// de asado"… Buscar la frase suelta trae poco o nada. Acá, para lo que el
// usuario escribió (1 a 4 palabras), se arma la lista de búsquedas reales
// relacionadas, así ve TODO lo de esa clase y no un solo pedazo.
//
// La fuente principal son los términos que la app ya usa para armar los
// rubros (DEFAULT_CATALOG_QUERIES): son búsquedas reales, no inventadas, y
// vienen ordenadas por importancia. Los sinónimos de abajo cubren cómo
// habla la gente cuando no coincide con ningún término del rubro.

import { CATALOG_PINNED, DEFAULT_CATALOG_QUERIES } from './products';
import { cleanTerm, stripAccents } from './searchFallback';

// Palabras/frases de todos los días que NO aparecen en el nombre de los
// productos -> lo que sí existe cargado en Precios Claros. Las claves van en
// singular y sin tildes (se comparan también en plural).
const SYNONYMS: Record<string, string[]> = {
  // Cortes reales de asado (los mismos que se fijan en el rubro Frescos).
  asado: ['tira de asado', 'vacio', 'matambre', 'tapa de asado', 'carne para asado'],
  salame: ['salame milan', 'salamin', 'salame tipo milan grande', 'salame casero'],
  carne: ['carne picada', 'bife de chorizo', 'milanesa', 'hamburguesa', 'nalga', 'peceto'],
  embutido: ['salame', 'chorizo', 'salchicha', 'mortadela', 'jamon cocido', 'morcilla'],
  fiambre: ['jamon cocido', 'salame', 'queso de maquina', 'mortadela', 'bondiola'],
  queso: ['queso cremoso', 'queso rallado', 'queso de maquina', 'queso untable', 'queso por salut'],
  golosina: ['caramelos', 'chicles', 'alfajor', 'chocolate', 'chupetines', 'gomitas', 'turron'],
  desayuno: ['cafe', 'te en saquitos', 'leche', 'galletitas', 'cereales', 'mermelada', 'dulce de leche'],
  merienda: ['galletitas', 'alfajor', 'leche chocolatada', 'mate cocido', 'budin', 'facturas'],
  verdura: ['tomate', 'cebolla', 'papa', 'zanahoria', 'lechuga', 'zapallo', 'morron'],
  fruta: ['banana', 'manzana', 'naranja', 'pera', 'limon', 'mandarina'],
  conserva: ['atun', 'arvejas', 'choclo', 'tomate triturado', 'duraznos', 'palmitos', 'lentejas'],
  enlatado: ['atun', 'arvejas', 'choclo', 'tomate triturado', 'duraznos', 'palmitos', 'lentejas'],
  condimento: ['sal fina', 'sal gruesa', 'pimienta', 'oregano', 'pimenton', 'aji molido', 'comino', 'provenzal'],
  especia: ['sal fina', 'sal gruesa', 'pimienta', 'oregano', 'pimenton', 'aji molido', 'comino', 'provenzal'],
  aderezo: ['mayonesa', 'ketchup', 'mostaza', 'salsa golf', 'aceto balsamico', 'aceite de oliva'],
  pasta: ['fideos secos', 'tallarines', 'ravioles', 'noquis', 'tapas de empanadas', 'lasagna'],
  sopa: ['sopa instantanea', 'caldo', 'sopa crema', 'puré instantaneo'],
  infusion: ['te en saquitos', 'cafe', 'yerba mate', 'mate cocido'],
  higiene: ['papel higienico', 'jabon de tocador', 'shampoo', 'pasta dental', 'desodorante', 'toallitas femeninas'],
  'higiene personal': ['jabon de tocador', 'shampoo', 'pasta dental', 'desodorante', 'cepillo dental'],
  'bebida alcoholica': ['cerveza', 'vino tinto', 'fernet', 'vodka', 'whisky'],
  alcohol: ['cerveza', 'vino tinto', 'fernet', 'vodka', 'whisky'],
  'comida bebe': ['papilla', 'leche infantil', 'cereal infantil', 'formula infantil', 'colado'],
  'comida para bebe': ['papilla', 'leche infantil', 'cereal infantil', 'formula infantil', 'colado'],
  carbon: ['carbon vegetal', 'carbon', 'leña', 'encendedor'],
  lena: ['carbon vegetal', 'leña'],
  // Parrilla, picada y bebidas
  hielo: ['hielo', 'bolsa de hielo', 'hielo en cubos'],
  picada: ['salame', 'queso de maquina', 'jamon crudo', 'aceitunas', 'mani', 'palitos salados', 'papas fritas snack', 'grisines'],
  picadita: ['salame', 'queso de maquina', 'jamon crudo', 'aceitunas', 'mani', 'palitos salados', 'papas fritas snack', 'grisines'],
  parrilla: ['tira de asado', 'vacio', 'chorizo', 'morcilla', 'provoleta', 'carbon vegetal', 'chimichurri'],
  parrillada: ['tira de asado', 'vacio', 'chorizo', 'morcilla', 'provoleta', 'carbon vegetal', 'chimichurri'],
  trago: ['fernet', 'gin', 'vodka', 'aperitivo', 'whisky', 'ron', 'gaseosa cola'],
  jugo: ['jugo en polvo', 'jugo de naranja', 'jugo listo', 'jugo concentrado'],
  // Almacén y cocina
  mate: ['yerba mate', 'azucar', 'edulcorante', 'bombilla', 'termo', 'bizcochitos', 'yuyos'],
  reposteria: ['harina 0000', 'azucar', 'huevos', 'manteca', 'polvo para hornear', 'esencia de vainilla', 'dulce de leche repostero', 'levadura'],
  torta: ['harina 0000', 'azucar', 'huevos', 'manteca', 'polvo para hornear', 'esencia de vainilla', 'dulce de leche repostero', 'levadura'],
  panaderia: ['pan lactal', 'pan de hamburguesa', 'pan de pancho', 'medialunas', 'prepizza', 'tostadas', 'grisines', 'facturas'],
  snack: ['papas fritas snack', 'palitos salados', 'mani', 'chizitos', 'nachos', 'pochoclo', 'galletitas saladas'],
  salsa: ['salsa de tomate', 'mayonesa', 'ketchup', 'mostaza', 'salsa golf', 'chimichurri', 'pure de tomate'],
  'sin tacc': ['sin tacc', 'galletitas sin tacc', 'fideos sin tacc', 'pan sin tacc', 'harina sin tacc', 'premezcla sin tacc'],
  celiaco: ['sin tacc', 'galletitas sin tacc', 'fideos sin tacc', 'pan sin tacc', 'harina sin tacc', 'premezcla sin tacc'],
  // Bebés, limpieza y cuidado personal
  bebe: ['pañales', 'pañitos humedos', 'leche infantil', 'shampoo para bebes', 'crema para bebes', 'papilla'],
  lavanderia: ['jabon en polvo', 'jabon liquido para ropa', 'suavizante', 'lavandina', 'quitamanchas', 'detergente para ropa liquido'],
  cabello: ['shampoo', 'acondicionador', 'crema de enjuague', 'tintura', 'gel para el pelo', 'fijador'],
  pelo: ['shampoo', 'acondicionador', 'crema de enjuague', 'tintura', 'gel para el pelo', 'fijador'],
  afeitar: ['espuma de afeitar', 'maquina de afeitar', 'gel de afeitar', 'after shave'],
  dental: ['pasta dental', 'cepillo dental', 'enjuague bucal', 'hilo dental'],
  descartable: ['bolsas de residuos', 'papel aluminio', 'film', 'servilletas', 'vasos descartables', 'platos descartables'],
  // Higiene y cuidado: repelentes, jabones, shampoos y parientes
  repelente: ['repelente aerosol', 'repelente en locion', 'repelente en crema', 'repelente para bebes', 'espiral repelente', 'repelente electrico', 'insecticida aerosol'],
  mosquito: ['repelente aerosol', 'repelente en locion', 'espiral repelente', 'repelente electrico', 'insecticida aerosol'],
  insecticida: ['insecticida aerosol', 'mata cucarachas', 'mata hormigas', 'espiral repelente', 'repelente electrico', 'cebo para hormigas'],
  jabon: ['jabon de tocador', 'jabon liquido para manos', 'jabon de glicerina', 'jabon en polvo', 'jabon liquido para ropa', 'jabon en pan', 'jabon blanco', 'jabon antibacterial'],
  shampoo: ['shampoo anticaspa', 'shampoo para niños', 'shampoo 2 en 1', 'shampoo cabello graso', 'shampoo cabello seco', 'shampoo cabello teñido', 'shampoo en barra', 'shampoo para bebes'],
  acondicionador: ['acondicionador', 'acondicionador para niños', 'crema de enjuague', 'mascara capilar', 'crema para peinar'],
  desodorante: ['desodorante aerosol', 'desodorante roll on', 'desodorante en barra', 'desodorante mujer', 'desodorante hombre', 'desodorante de ambiente'],
  'protector solar': ['protector solar', 'protector solar factor 50', 'protector solar para niños', 'bronceador', 'after sun'],
  solar: ['protector solar', 'protector solar factor 50', 'protector solar para niños', 'bronceador', 'after sun'],
  // Modismos y abreviaturas
  birra: ['cerveza'],
  chori: ['chorizo'],
  gaseosa: ['gaseosa cola', 'gaseosa lima limon', 'gaseosa naranja', 'agua saborizada'],
  factura: ['medialunas', 'facturas'],
  lacteo: ['leche', 'yogur', 'queso cremoso', 'manteca', 'crema de leche', 'dulce de leche'],
};

const norm = (s: string) => stripAccents(cleanTerm(s).toLowerCase());

// Relleno que no dice de qué producto se habla.
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'y', 'o', 'a', 'en', 'un', 'una', 'por', 'al', 'producto', 'productos', 'cosas', 'articulo', 'articulos']);

// Nombres de los rubros de la app: buscar "limpieza" o "productos de limpieza"
// muestra lo principal de ese rubro (los productos no dicen "limpieza" en el
// nombre, así que la frase suelta no encuentra nada).
const RUBROS: Record<string, string> = {
  limpieza: 'Limpieza',
  lacteo: 'Lácteos',
  almacen: 'Almacén',
  bebida: 'Bebidas',
  perfumeria: 'Perfumería',
  fresco: 'Frescos',
  verduleria: 'Verdulería',
  congelado: 'Congelados',
  mascota: 'Mascotas',
};
// "comida de gatos" = "alimento para gatos": no son parte del producto, son
// la intención (querer comida) y sirven para preferir los términos de alimento.
const FOOD_WORDS = new Set(['comida', 'alimento', 'alimentos', 'balanceado', 'balanceados']);

// Cuántas búsquedas relacionadas se suman a la literal como máximo.
const MAX_RELATED = 8;
// Las palabras de grupo armadas a mano pueden traer más variantes.
const MAX_GROUP = 10;

// "gatos" ~ "gato", "papas" ~ "papa", "panes" ~ "pan".
function forms(w: string): string[] {
  const out = [w];
  if (w.length > 3 && w.endsWith('s')) out.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) out.push(w.slice(0, -2));
  return out;
}
function same(a: string, b: string): boolean {
  const fb = forms(b);
  return forms(a).some((x) => fb.includes(x));
}

type Entry = { q: string; n: string; words: string[]; cat: string };
let index: Entry[] | null = null;
function catalogIndex(): Entry[] {
  if (!index) {
    const seen = new Set<string>();
    index = [];
    // Las fijas del rubro (CATALOG_PINNED) primero: son las que se eligieron
    // a mano como "lo primero que uno espera encontrar".
    const pinned = Object.entries(CATALOG_PINNED).flatMap(([cat, qs]) => qs.map((q) => ({ category: cat, query: q })));
    for (const { category, query } of [...pinned, ...DEFAULT_CATALOG_QUERIES]) {
      const n = norm(query);
      if (seen.has(n)) continue;
      seen.add(n);
      index.push({ q: query, n, words: n.split(' '), cat: category });
    }
  }
  return index;
}

// Devuelve hasta MAX_RELATED búsquedas reales relacionadas con lo tipeado, o
// [] si es un título largo y específico (eso lo cubre el fallback) o no hay
// nada relacionado.
export function relatedTerms(term: string): string[] {
  const t = norm(term);
  if (t.length < 3) return [];

  const words = t.split(' ').filter(Boolean);
  const core = words.filter((w) => !STOPWORDS.has(w) && !FOOD_WORDS.has(w));
  const wantsFood = words.some((w) => FOOD_WORDS.has(w));
  // Vacío ("comida" sola) es demasiado vago; largo (título pegado) es
  // específico y no se expande.
  if (!core.length || core.length > 3) return [];

  const out: string[] = [];
  const push = (q: string) => {
    if (norm(q) === t) return; // la literal ya se busca aparte
    if (!out.some((o) => norm(o) === norm(q))) out.push(q);
  };

  // Sinónimos: se prueba la frase entera y las palabras clave, en singular y
  // plural ("golosinas" y "golosina" son la misma clave).
  for (const k of [t, core.join(' ')]) {
    const hit = forms(k).map((f) => SYNONYMS[f]).find(Boolean);
    if (hit) {
      hit.forEach(push);
      // Lista armada a mano: se devuelve SOLO eso. Es más precisa que lo que
      // saldría del catálogo ("verduras" no debe traer "caldo de verduras").
      return out.slice(0, MAX_GROUP);
    }
  }

  // Nombre de un rubro de la app -> lo principal de ese rubro.
  if (core.length === 1) {
    const rubro = Object.entries(RUBROS).find(([k]) => same(core[0], k))?.[1];
    if (rubro) {
      catalogIndex()
        .filter((e) => e.cat === rubro)
        .forEach((e) => push(e.q));
      return out.slice(0, MAX_RELATED);
    }
  }

  // Términos del catálogo que tengan TODAS las palabras de lo tipeado.
  const scored = catalogIndex()
    .map((e, order) => {
      if (!core.every((c) => e.words.some((w) => same(w, c)))) return null;
      let score = 0;
      // Empieza con lo tipeado ("pan" -> "pan lactal", no "jabon en pan").
      if (same(e.words[0], core[0])) score += 5;
      // Pidió "comida": primero los de alimento.
      if (wantsFood && e.words.some((w) => FOOD_WORDS.has(w))) score += 3;
      return { e, score, order };
    })
    .filter((x): x is { e: Entry; score: number; order: number } => x !== null);

  // Si algunos empiezan con lo tipeado, los que solo lo traen de pasada
  // ("jabon en pan glicerina") quedan afuera.
  // Pidió "comida de X" pero no hay ningún término de alimento con X (ej.
  // "comida para bebes" -> solo "repelente para bebes"): mejor no mostrar
  // relacionados que mostrar algo que no es lo que busca.
  if (wantsFood && !scored.some((s) => s.score >= 3)) return out.slice(0, MAX_RELATED);

  const best = Math.max(0, ...scored.map((s) => s.score));
  scored
    .filter((s) => best < 5 || s.score >= 5 || (wantsFood && s.score >= 3))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .forEach((s) => push(s.e.q));

  return out.slice(0, MAX_RELATED);
}
