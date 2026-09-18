import { DEFAULT_CATALOG_QUERIES } from './products';

// Pool de términos "populares" para sugerir búsquedas relacionadas. Reusamos
// las queries que ya usamos para armar el catálogo (son, de hecho, los
// productos más buscados en un súper), en vez de mantener una lista aparte.
const POOL: string[] = Array.from(
  new Set(DEFAULT_CATALOG_QUERIES.map((q) => q.query))
);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function titleCase(s: string): string {
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// Busca términos del pool relacionados con lo que el usuario está tirando de
// escribir. Prioriza los que empiezan igual, después los que contienen el
// texto completo, y por último los que comparten alguna palabra suelta.
export function getRelatedSearches(query: string, limit = 5): string[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 2);

  const scored = POOL.map((term) => {
    const t = normalize(term);
    if (t === q) return { term, score: 0 };
    let score = 0;
    if (t.startsWith(q)) score = 4;
    else if (t.includes(q)) score = 3;
    else if (words.some((w) => t.includes(w))) score = 2;
    else if (q.split(' ')[0] && t.split(' ')[0] === q.split(' ')[0]) score = 1;
    return { term, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { term } of scored) {
    const key = normalize(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(titleCase(term));
    if (out.length >= limit) break;
  }
  return out;
}
