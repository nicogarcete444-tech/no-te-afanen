'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SortOrder } from '@/lib/liveItems';

const OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'relevancia', label: 'Relevancia' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
];

// El selector de orden vive como última píldora de la fila de filtros
// ("Filtro"). Esa fila scrollea hacia los costados, y un panel absoluto
// adentro de un contenedor con scroll se corta. Por eso el panel se dibuja
// con position:fixed, pegado al botón, y se cierra si la página se mueve.
export default function SortMenu({
  value,
  onChange,
}: {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // Alto aproximado del panel (3 opciones) y de la barra de abajo: si el
    // botón está tan abajo que el panel taparía la barra o se saldría de la
    // pantalla, el panel se abre hacia arriba.
    const PANEL_H = 160;
    const NAV_H = 96;
    const opensUp = r.bottom + 8 + PANEL_H > window.innerHeight - NAV_H && r.top - 8 - PANEL_H > 0;
    const right = Math.max(12, window.innerWidth - r.right); // pegado al borde derecho del botón
    setPos(opensUp ? { bottom: window.innerHeight - r.top + 8, right } : { top: r.bottom + 8, right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Se cierra si la página se mueve de verdad (el panel es fixed y
    // quedaría despegado del botón), pero no por un scroll de un par de
    // píxeles: al abrirlo el navegador a veces reacomoda la vista un poco.
    const startY = window.scrollY;
    const startW = window.innerWidth;
    function onScroll() {
      if (Math.abs(window.scrollY - startY) > 12) setOpen(false);
    }
    function onResize() {
      if (window.innerWidth !== startW) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === value) || OPTIONS[0];
  const active = value !== 'relevancia';

  return (
    <div className="sort-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`filter-pill sort-pill${open ? ' open' : ''}${active ? ' has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtro de orden: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
        Filtro
      </button>

      {open && pos && (
        <div className="sort-panel" role="listbox" style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`sort-option${o.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
