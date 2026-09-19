import type { ReactNode } from 'react';

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 26, scrollMarginTop: 90 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>
      <div
        style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}
        className="legal-body"
      >
        {children}
      </div>
    </section>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 14, marginBottom: 4 }}>
      {children}
    </div>
  );
}

// Cartel de "esto no es asesoramiento legal" que va arriba de las tres
// páginas (índice, privacidad, términos) — el mismo texto en las tres para
// no dar la idea de que una es "más oficial" que la otra.
export function LegalDisclaimer() {
  return (
    <div
      style={{
        background: 'var(--chip-bg)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '14px 16px',
        fontSize: 12.5,
        lineHeight: 1.55,
        color: 'var(--ink-soft)',
        marginBottom: 32,
      }}
    >
      Este texto es una guía redactada a partir de cómo funciona hoy la app y de la
      normativa argentina vigente. No reemplaza el asesoramiento de un abogado/a: antes
      de publicar la app en producción o de escalarla (más usuarios, publicidad, pagos),
      te recomendamos que la revise un profesional.
    </div>
  );
}

// Fecha de última actualización de los textos legales. La fuente de verdad es
// la versión ISO porque hay dos consumidores con necesidades distintas: las
// páginas de /legal la muestran en castellano y app/sitemap.ts la necesita como
// fecha real para el <lastmod> del sitemap. Si estuvieran escritas por separado
// se iban a desincronizar en la primera edición apurada de los términos, así
// que acá se escribe una sola vez y el texto en castellano se deriva.
export const LAST_UPDATED_ISO = '2026-09-17';

// timeZone UTC a propósito: 'YYYY-MM-DD' se parsea como medianoche UTC y, sin
// fijar la zona, en Argentina (UTC-3) se renderizaría el día anterior.
export const LAST_UPDATED = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(LAST_UPDATED_ISO));
