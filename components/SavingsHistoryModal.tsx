'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/products';
import { currentMonthKey, getMonthlyHistory, MonthlySaving } from '@/lib/savingsHistory';

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getMonthlyHistory(userId, 6).then((data) => {
      if (!cancelled) {
        setMonths(data);
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
  const maxTotal = Math.max(1, ...months.map((m) => m.total));

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

              <div className="list-header" style={{ marginTop: 22 }}>
                <h2 style={{ fontSize: 15 }}>Últimos {months.length} meses</h2>
              </div>

              {totalAcumulado === 0 ? (
                <div className="cart-sheet-empty">
                  Todavía no registramos ahorros. Cuando confirmes una lista de compras desde
                  &quot;Comparación por súper&quot;, el ahorro de esa compra se suma acá.
                </div>
              ) : (
                <>
                  <div className="savings-chart">
                    {months.map((m) => {
                      const isCurrent = m.month === currentMonthKey();
                      const heightPct = Math.max(4, Math.round((m.total / maxTotal) * 100));
                      return (
                        <div className="savings-chart-col" key={m.month}>
                          <div className="savings-chart-val">{m.total > 0 ? fmt(m.total) : ''}</div>
                          <div className="savings-chart-track">
                            <div
                              className={`savings-chart-bar${isCurrent ? ' current' : ''}`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <div className="savings-chart-label">{m.label}</div>
                        </div>
                      );
                    })}
                  </div>

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
