import { NextRequest, NextResponse } from 'next/server';
import { fetchPreciosClaros } from '@/lib/preciosClarosBase';
import { isRateLimited, parseLat, parseLimit, parseLng, RATE_LIMITS, sanitizeQuery } from '@/lib/apiSecurity';
import { buildFallbackCandidates, isWholeMatch, rankByTokens } from '@/lib/searchFallback';
import { relatedTerms } from '@/lib/searchAliases';

const API_URL =
  process.env.PRECIOS_CLAROS_API_URL ||
  'https://d3e6htiiul5ek9.cloudfront.net/prod/productos';

// Le da más margen a la función serverless para el timeout + reintento de
// fetchPreciosClaros (hasta ~14s en el peor caso) sin que Vercel la corte
// antes de que termine de reintentar (y de probar las búsquedas alternativas
// del modo smart, que van en paralelo con timeout corto).
export const maxDuration = 30;

// Este endpoint corre en el servidor de Vercel, no en el navegador del usuario.
// Por eso el bloqueo CORS de Precios Claros no aplica acá: el navegador
// le habla a NUESTRO dominio, y nosotros le hablamos a Precios Claros por atrás.
export async function GET(request: NextRequest) {
  if (await isRateLimited(request, 'productos', RATE_LIMITS.productos)) {
    return NextResponse.json({ error: 'Demasiadas búsquedas. Esperá un momento.' }, { status: 429 });
  }

  // 120 y no los 80 por defecto: los títulos de producto que la gente copia
  // de la ficha ("MARCA — nombre largo 3 Kg") pasan de 80 caracteres y
  // cortados a la mitad de una palabra ya no matchean nada.
  const term = sanitizeQuery(request.nextUrl.searchParams.get('q'), 120);
  // smart=1 lo manda solo el buscador (lo que el usuario tipea o pega). La
  // vidriera y los rubros disparan decenas de términos fijos y NO deben
  // multiplicar sus pedidos a la API del Estado con reintentos.
  const smart = request.nextUrl.searchParams.get('smart') === '1';
  const lat = parseLat(request.nextUrl.searchParams.get('lat'));
  const lng = parseLng(request.nextUrl.searchParams.get('lng'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'), 12, 50);

  if (!term || term.length < 2) {
    return NextResponse.json(
      { error: 'Falta el parámetro "q" con al menos 2 caracteres.' },
      { status: 400 }
    );
  }

  // La API de Precios Claros exige lat/lng para poder buscar productos
  // (los usa para priorizar resultados de sucursales cercanas).
  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: 'Faltan o son inválidos los parámetros "lat" y "lng".' },
      { status: 400 }
    );
  }

  // Cuántos productos se piden por página en el buscador (smart). Con 12 se
  // veía un pedacito de lo que la gente busca ("pan", "shampoo"); acá se
  // trae bastante más y, si la página viene llena, una segunda.
  const SMART_PAGE = 40;
  const SMART_MAX = 80;

  const buildUrl = (q: string, size: number, offset: number) =>
    `${API_URL}?string=${encodeURIComponent(q)}&lat=${lat}&lng=${lng}&offset=${offset}&limit=${size}&sort=-cant_sucursales_disponible`;

  // Seis horas de caché. Los precios cambian durante el día (promos,
  // ajustes de lista) y esto alimenta la vidriera: una semana de caché,
  // como estaba antes, mostraba precios que ya no existían.
  async function fetchTerm(
    q: string,
    opts?: { timeoutMs?: number; retries?: number; size?: number; offset?: number }
  ): Promise<{ ok: boolean; data: any }> {
    const { size = limit, offset = 0, ...net } = opts || {};
    const upstream = await fetchPreciosClaros(buildUrl(q, size, offset), 60 * 60 * 6, net);
    if (!upstream.ok) return { ok: false, data: null };
    return { ok: true, data: await upstream.json() };
  }

  const keyOf = (item: any) =>
    String(item.id ?? item.id_producto ?? `${item.marca}|${item.nombre}|${item.presentacion}`);

  // Junta varias listas de a una por vuelta (la primera es la literal y va
  // adelante) sin repetidos.
  function weave(lists: any[][], max: number): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest && out.length < max; i++) {
      for (const l of lists) {
        const item = l[i];
        if (!item) continue;
        const key = keyOf(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= max) break;
      }
    }
    return out;
  }

  try {
    // Buscador: página grande. Si la API no la acepta, se cae a la común.
    let pageSize = smart ? SMART_PAGE : limit;
    let first = await fetchTerm(term, { size: pageSize });
    if (!first.ok && smart) {
      pageSize = limit;
      first = await fetchTerm(term, { size: pageSize });
    }

    if (!first.ok) {
      return NextResponse.json(
        { error: 'No pudimos consultar Precios Claros en este momento.' },
        { status: 502 }
      );
    }
    if (!smart) {
      return NextResponse.json(first.data);
    }

    const literal: any[] = [...(first.data?.productos || [])];

    // Si la página vino llena, hay más de lo mismo: una segunda página.
    if (literal.length >= pageSize) {
      const more = await fetchTerm(term, { size: pageSize, offset: pageSize, timeoutMs: 5000, retries: 0 }).catch(
        () => ({ ok: false, data: null })
      );
      if (more.ok) literal.push(...(more.data?.productos || []));
    }

    // Lo de todos los días ("pan", "comida de gatos", "papas fritas"): además
    // de la literal, los términos reales relacionados (lib/searchAliases.ts).
    const related = relatedTerms(term);
    const relLists: any[][] = [];
    const usedRel: string[] = [];
    if (related.length) {
      const settledRel = await Promise.allSettled(
        related.map((c) => fetchTerm(c, { timeoutMs: 5000, retries: 0 }))
      );
      settledRel.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value.ok) return;
        const items: any[] = r.value.data?.productos || [];
        if (items.length) {
          relLists.push(items);
          usedRel.push(related[i]);
        }
      });
    }

    if (literal.length || relLists.length) {
      const productos = weave([literal, ...relLists], SMART_MAX);
      if (!relLists.length) {
        // Resultado normal, tal cual lo devolvió la API.
        return NextResponse.json({ ...(first.data || {}), productos });
      }
      return NextResponse.json({
        ...(first.data || {}),
        productos,
        relacionados: true,
        busquedasUsadas: usedRel,
      });
    }

    // Sin resultados con la frase tal cual ni con relacionadas: probamos
    // versiones alternativas en paralelo (lib/searchFallback.ts).
    const candidates = buildFallbackCandidates(term);
    const settled = await Promise.allSettled(
      candidates.map((c) => fetchTerm(c, { timeoutMs: 5000, retries: 0, size: pageSize }))
    );

    // Si la primera versión que tiene TODAS las palabras del título (sin
    // marca ni guiones) trajo resultados, es el mismo producto que se copió:
    // se muestran solo esos y no se presenta como "aproximado".
    const headIdx = candidates.findIndex((c, i) => {
      const r = settled[i];
      return (
        isWholeMatch(term, c) &&
        r.status === 'fulfilled' &&
        r.value.ok &&
        (r.value.data?.productos || []).length > 0
      );
    });
    if (headIdx >= 0) {
      const r = settled[headIdx] as PromiseFulfilledResult<{ ok: boolean; data: any }>;
      return NextResponse.json({
        ...(first.data || {}),
        productos: rankByTokens(r.value.data.productos as any[], term),
        aproximada: false,
        busquedasUsadas: [candidates[headIdx]],
      });
    }

    const lists: any[][] = [];
    const used: string[] = [];
    settled.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value.ok) return;
      const items: any[] = r.value.data?.productos || [];
      if (items.length) {
        lists.push(items);
        used.push(candidates[i]);
      }
    });

    const ranked = rankByTokens(weave(lists, SMART_MAX * 2), term).slice(0, SMART_MAX);
    return NextResponse.json({
      ...(first.data || {}),
      productos: ranked,
      // Le avisa a la pantalla que esto son coincidencias parecidas y no la
      // búsqueda exacta, para no venderlo como si lo fuera.
      aproximada: ranked.length > 0,
      busquedasUsadas: used,
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo contactar a Precios Claros en este momento.' },
      { status: 502 }
    );
  }
}
