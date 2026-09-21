'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CATEGORY_COLORS, fmt } from '@/lib/products';
import {
  CategorySaving,
  currentMonthKey,
  getCategoryBreakdown,
  getMonthlyHistory,
  MonthlySaving,
} from '@/lib/savingsHistory';

// Colores para la torta de rubros. Reusa CATEGORY_COLORS (el mismo verde/
// azul/naranja que ya se usa en los puntitos de cada rubro en el catálogo),
// así el color de "Limpieza" en la torta es el mismo que el del chip — no
// hay que aprender una paleta nueva. "Otros" (productos sin rubro) usa un
// gris fijo porque no tiene entrada en CATEGORY_COLORS.
const OTROS_COLOR = '#9AA39C';
function colorFor(category: string): string {
  return (CATEGORY_COLORS[category] || [OTROS_COLOR, OTROS_COLOR])[1];
}

// Torta simple armada con arcos SVG (sin librería: son pocas porciones y
// esto evita sumar una dependencia solo para esto). `data` ya viene
// ordenado de mayor a menor desde getCategoryBreakdown.
function CategoryPie({ data }: { data: CategorySaving[] }) {
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  if (total <= 0) return null;

  const R = 42;
  const CX = 50;
  const CY = 50;
  let angle = -90; // arranca arriba, como un reloj

  const slices = data.map((d) => {
    const fraction = d.amount / total;
    const startAngle = angle;
    const endAngle = angle + fraction * 360;
    angle = endAngle;

    // Porción que es prácticamente el 100% (un solo rubro): un arco no se
    // puede dibujar como círculo completo con esta técnica (start === end),
    // así que ese caso especial dibuja el círculo entero directo.
    if (fraction > 0.999) {
      return <circle key={d.category} cx={CX} cy={CY} r={R} fill={colorFor(d.category)} />;
    }

    const toXY = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
    };
    const [x1, y1] = toXY(startAngle);
    const [x2, y2] = toXY(endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return (
      <path
        key={d.category}
        d={`M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={colorFor(d.category)}
      />
    );
  });

  return (
    <svg viewBox="0 0 100 100" width="128" height="128" role="img" aria-label="Ahorro por rubro">
      {slices}
      {/* Agujerito en el medio: la misma torta se lee más liviana como
          donut, y ahí adentro entra el total sin agrandar el SVG. */}
      <circle cx={CX} cy={CY} r={24} fill="var(--surface, #fff)" />
    </svg>
  );
}


// ---- Gráfico de barras estilo Mercado Pago -------------------------------
// Eje Y a la izquierda con líneas punteadas, barras azules con puntas
// redondeadas, mes seleccionado con línea punteada vertical y globito
// blanco con el monto en verde. Se desplaza horizontal (12 meses) y
// arranca mostrando el mes actual, con un difuminado a la izquierda cuando
// hay más meses ocultos.
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PLOT_H = 200; // alto del área de barras, en px
const TOOLTIP_H = 54;

function monthParts(key: string): { short: string; year: string } {
  const [y, m] = key.split('-');
  return { short: MESES_CORTOS[Number(m) - 1] || '', year: y };
}

// Eje Y "lindo": 3 tramos con un paso redondo (500, 1 mil, 1,5 mil...).
function niceAxis(max: number): { step: number; top: number } {
  const raw = Math.max(max, 1) / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = [1, 1.5, 2, 2.5, 3, 5, 7.5, 10];
  const step = (steps.find((k) => k * mag >= raw) ?? 10) * mag;
  return { step, top: step * 3 };
}

// "$ 500", "$ 1,5 mil", "$ 2 M" — como el eje de Mercado Pago.
function axisLabel(v: number): string {
  if (v >= 1_000_000) return `$ ${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (v >= 1000) return `$ ${(v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil`;
  return `$ ${Math.round(v)}`;
}

function moneyExact(v: number): string {
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SavingsChart({ months }: { months: MonthlySaving[] }) {
  const [selected, setSelected] = useState(months.length - 1);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Al abrir, mostrar el final (mes actual).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [months.length]);

  const { step, top } = niceAxis(Math.max(...months.map((m) => m.total), 0));
  const ticks = [0, step, step * 2, step * 3];
  const sel = months[selected] ?? months[months.length - 1];
  const selParts = monthParts(sel.month);

  return (
    <div className="mp-chart">
      <div className="mp-axis" style={{ height: PLOT_H }}>
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
            {axisLabel(t)}
          </span>
        ))}
      </div>

      <div
        className={`mp-scroll${scrolled ? ' faded' : ''}`}
        ref={scrollRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 4)}
      >
        <div className="mp-inner" style={{ minWidth: months.length * 52 + 80 }}>
          <div className="mp-plot" style={{ height: PLOT_H }}>
            {ticks.map((t) => (
              <div key={t} className={`mp-grid${t === 0 ? ' base' : ''}`} style={{ bottom: `${(t / top) * 100}%` }} />
            ))}

            <div className="mp-cols">
              {months.map((m, i) => {
                const h = m.total > 0 ? Math.max(3, (m.total / top) * PLOT_H) : 2;
                const isSel = i === selected;
                return (
                  <button
                    type="button"
                    key={m.month}
                    className="mp-col"
                    aria-label={`${monthParts(m.month).short} ${monthParts(m.month).year}: ${moneyExact(m.total)} pesos`}
                    aria-pressed={isSel}
                    onClick={() => setSelected(i)}
                  >
                    {isSel && (
                      <>
                        <span className="mp-vline" style={{ top: 0, bottom: h }} />
                        <span
                          className="mp-tip"
                          style={{ bottom: Math.min(h + 14, PLOT_H - TOOLTIP_H) }}
                        >
                          <b>+ ${moneyExact(m.total)}</b>
                          <small>
                            {selParts.short}/{selParts.year}
                          </small>
                        </span>
                      </>
                    )}
                    <span className={`mp-bar${m.total <= 0 ? ' zero' : ''}`} style={{ height: h }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mp-xlabels">
            {months.map((m, i) => (
              <span key={m.month} className={i === selected ? 'sel' : ''}>
                {monthParts(m.month).short}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SavingsHistoryModal({
  open,
  onClose,
  userId,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  // Cambia cada vez que se registra un ahorro nuevo, para forzar releer el
  // historial mientras el modal ya está abierto.
  refreshKey: number;
}) {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthlySaving[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategorySaving[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getMonthlyHistory(userId, 12), getCategoryBreakdown(userId)]).then(([data, byCategory]) => {
      if (!cancelled) {
        setMonths(data);
        setCategoryBreakdown(byCategory);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, refreshKey]);

  if (!open) return null;

  const thisMonth = months.find((m) => m.month === currentMonthKey());
  const thisMonthTotal = thisMonth ? thisMonth.total : 0;
  const totalAcumulado = months.reduce((sum, m) => sum + m.total, 0);
  const categoryTotal = categoryBreakdown.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="cart-overlay show" onClick={onClose}>
      <div className="cart-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cart-sheet-head">
          <h3>Tus ahorros</h3>
          <button className="cart-sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="cart-sheet-list">
          {loading ? (
            <div className="skeleton">
              <div className="sk-line w60" />
              <div className="sk-line full" />
            </div>
          ) : (
            <>
              <div className="savings-card" style={{ marginTop: 4 }}>
                <div className="savings-label">Ahorraste este mes</div>
                <div className="savings-row">
                  <div>
                    <div className="savings-amount">{fmt(thisMonthTotal)}</div>
                    <div className="savings-detail">
                      sumando lo que ahorraste en cada lista de compras que confirmaste este mes
                    </div>
                  </div>
                </div>
              </div>

              {categoryTotal > 0 && (
                <>
                  <div className="list-header" style={{ marginTop: 22 }}>
                    <h2 style={{ fontSize: 15 }}>Por rubro este mes</h2>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      marginTop: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <CategoryPie data={categoryBreakdown} />
                    <div style={{ flex: '1 1 160px', minWidth: 160 }}>
                      {categoryBreakdown.map((c) => (
                        <div
                          key={c.category}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            padding: '4px 0',
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              background: colorFor(c.category),
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, color: 'var(--ink-soft)' }}>{c.category}</span>
                          <span style={{ fontWeight: 600 }}>
                            {Math.round((c.amount / categoryTotal) * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="list-header" style={{ marginTop: 22 }}>
                <h2 style={{ fontSize: 15 }}>Historial</h2>
              </div>

              {totalAcumulado === 0 ? (
                <div className="cart-sheet-empty">
                  Todavía no registramos ahorros. Cuando confirmes una lista de compras desde
                  &quot;Comparación por súper&quot;, el ahorro de esa compra se suma acá.
                </div>
              ) : (
                <>
                  <SavingsChart key={months.length + '-' + refreshKey} months={months} />

                  <div className="cart-sheet-total" style={{ marginTop: 18 }}>
                    <span className="label">Ahorro acumulado (últimos {months.length} meses)</span>
                    <span className="val">{fmt(totalAcumulado)}</span>
                  </div>
                </>
              )}

              {!userId && (
                <div className="cart-sheet-footnote" style={{ marginTop: 16 }}>
                  Este historial se guarda en este dispositivo. Creá una cuenta para no perderlo si
                  cambiás de celular o navegador.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
