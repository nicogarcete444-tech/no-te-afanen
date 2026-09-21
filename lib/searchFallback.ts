// Búsqueda tolerante para Precios Claros.
//
// Precios Claros busca el término como una FRASE dentro del nombre real del
// producto. Por eso pasaba esto: la ficha muestra "MARCA — nombre" (ver
// displayNameFor), el usuario copiaba ese título tal cual, lo pegaba en el
// buscador y no salía nada, porque "CAT CHOW — Alimento para Gatos..." no
// existe como frase en ningún lado: la marca es un campo aparte y el guion
// largo lo puso la app. Lo mismo con cualquier búsqueda de varias palabras
// que no aparezcan pegadas ("asado salame").
//
// Acá se arman versiones alternativas de lo tipeado para probar cuando la
// búsqueda exacta no trae nada, y se ordenan los resultados por cuántas
// palabras de lo tipeado tiene cada uno.

type Item = { nombre?: string; marca?: string; presentacion?: string };

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Guiones largos/cortos, barras, comillas y paréntesis no forman parte del
// nombre de ningún producto: pasan a espacio.
export function cleanTerm(s: string): string {
  return s
    .replace(/[—–|/\\"“”'‘’()[\]{},;:!?¿¡]+/g, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(s: string): string[] {
  return cleanTerm(s).split(' ').filter(Boolean);
}

// Palabras "con contenido" para puntuar: sin las de 1-2 letras (y, de, la…).
// Relleno que no dice de qué producto se habla, y "comida" ~ "alimento".
const FILLER = new Set(['para', 'del', 'las', 'los', 'con', 'sin', 'por', 'una', 'uno', 'producto', 'productos', 'cosas']);
const FOOD = new Set(['comida', 'alimento', 'alimentos', 'balanceado', 'balanceados']);

function tokens(s: string): string[] {
  return stripAccents(cleanTerm(s).toLowerCase())
    .split(' ')
    .filter((w) => w.length >= 3 && !FILLER.has(w));
}

// Raíz simple para comparar singular/plural ("gatos" ~ "gato").
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// Versiones alternativas para probar, de la más parecida a lo tipeado a la
// más laxa. Máximo `max`, sin repetidos y sin la búsqueda original (esa ya
// se probó).
export function buildFallbackCandidates(original: string, max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>([original.trim().toLowerCase()]);
  const add = (c: string) => {
    const t = c.trim();
    if (t.length < 3) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  // 1) el título con "MARCA — nombre": el nombre solo es lo que sí existe
  //    tal cual en Precios Claros.
  const dash = original.split(/\s[—–-]\s/);
  const nameOnly = dash.length > 1 ? dash.slice(1).join(' ') : '';
  const brandOnly = dash.length > 1 ? dash[0] : '';
  // Primero TAL CUAL (con comas, puntos, paréntesis: "2,25 L", "(x2)"), porque
  // así está cargado en Precios Claros; recién después limpio.
  if (nameOnly) {
    add(nameOnly);
    add(cleanTerm(nameOnly));
  }

  // 2) el texto sin signos raros (guiones largos, comillas…).
  add(cleanTerm(original));

  // 3) sin acentos (varios productos vienen cargados sin tildes).
  const noAccents = stripAccents(cleanTerm(original));
  add(noAccents);

  // 4) la frase acortada desde el final: el principio del nombre suele ser
  //    lo que más se parece a como está cargado ("Alimento para Gatos
  //    Adultos Carne y" antes que "Pollo Cat Chow 3 Kg").
  const base = words(nameOnly || original);
  if (base.length > 3) {
    add(base.slice(0, Math.max(3, Math.ceil(base.length * 0.6))).join(' '));
    add(base.slice(0, Math.max(2, Math.ceil(base.length * 0.35))).join(' '));
  }

  // 5) la marca sola.
  if (brandOnly) add(cleanTerm(brandOnly));

  // 6) palabra por palabra (para CUALQUIER búsqueda, no una lista fija):
  //    "comida de gatos" no existe como frase, pero "gato" sí aparece en
  //    todos los productos de gatos. Se sacan las palabras de relleno y
  //    "comida/alimento" (no dicen qué producto es), se prueba la raíz
  //    ("gato" encuentra "gato" y "gatos") y la palabra tal cual.
  if (base.length > 1) {
    const core = tokens(base.join(' ')).filter((w) => !FOOD.has(w));
    const pick = (core.length ? core : tokens(base.join(' ')))
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
    pick.forEach((w) => {
      add(stem(w));
      add(w);
    });
  }

  // 7) singular simple: "galletitas" -> "galletita".
  if (base.length === 1 && base[0].length >= 5 && /s$/i.test(base[0])) {
    add(base[0].slice(0, -1));
  }

  return out.slice(0, max);
}

// Ordena por cuántas palabras de lo tipeado aparecen en marca + nombre +
// presentación. Es un sort estable: a igual puntaje, queda el orden que ya
// traía Precios Claros (más sucursales primero).
export function rankByTokens<T extends Item>(items: T[], original: string): T[] {
  const wanted = tokens(original);
  if (!wanted.length) return items;
  const scored = items.map((item, index) => {
    const hay = stripAccents(
      `${item.marca || ''} ${item.nombre || ''} ${item.presentacion || ''}`.toLowerCase()
    );
    const score = wanted.reduce((n, w) => {
      if (FOOD.has(w)) {
        return n + (/(alimento|comida|balanceado)/.test(hay) ? 1 : 0);
      }
      return n + (hay.includes(stem(w)) ? 1 : 0);
    }, 0);
    return { item, index, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}

// ¿Este candidato tiene TODAS las palabras del título (sin marca ni guion)?
// Si sí, es el mismo producto que se pegó, no una versión más laxa.
export function isWholeMatch(original: string, candidate: string): boolean {
  const dash = original.split(/\s[—–-]\s/);
  const base = tokens(dash.length > 1 ? dash.slice(1).join(' ') : original);
  const have = tokens(candidate);
  return base.length > 0 && base.every((w) => have.includes(w));
}
