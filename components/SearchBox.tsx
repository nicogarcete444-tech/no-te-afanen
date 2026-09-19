'use client';

import { useEffect, useRef, useState } from 'react';
import { getRelatedSearches } from '@/lib/relatedSearches';

export default function SearchBox({
  value,
  onChange,
  onPhotoSearch,
  onScan,
}: {
  value: string;
  onChange: (v: string) => void;
  onPhotoSearch?: () => void;
  // Escanear un código de barras dejó de ser un botón grande aparte debajo
  // del buscador y pasó a vivir acá adentro, al lado de la búsqueda por
  // foto: son las dos formas de "buscar sin escribir", tienen que estar
  // juntas y en el mismo lugar donde la persona ya está mirando.
  onScan?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocused(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [focused]);

  const suggestions = focused ? getRelatedSearches(value) : [];

  function selectSuggestion(term: string) {
    onChange(term);
    setFocused(false);
  }

  return (
    <div className="search-box-wrap" ref={wrapRef}>
      <div className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-soft)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          // type="search" + enterKeyHint: en el celular el teclado muestra
          // la tecla "Buscar" en vez de "Intro", y el navegador entiende el
          // campo como una búsqueda. autoCorrect/spellCheck apagados porque
          // los nombres de producto y de marca no están en el diccionario y
          // el corrector los rompía mientras se tipeaba.
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Buscar producto, marca o categoría..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // Enter no dispara ninguna búsqueda nueva (ya se busca solo
            // mientras tipeás), pero sí baja el teclado y cierra las
            // sugerencias: sin esto el teclado quedaba tapando la mitad de
            // los resultados que la persona acababa de pedir.
            e.preventDefault();
            setFocused(false);
            inputRef.current?.blur();
          }}
        />
        <button
          className={`clear-btn${value ? ' show' : ''}`}
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {onScan && !value && (
          <button
            type="button"
            className="scan-btn"
            aria-label="Escanear código de barras"
            title="Escanear código de barras"
            onClick={onScan}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <path d="M7 8v8M10.5 8v8M13 8v8M16 8v3M16 15v1M19 8v8" />
            </svg>
          </button>
        )}
        {onPhotoSearch && !value && (
          <button
            type="button"
            className="scan-btn"
            aria-label="Buscar por foto"
            title="Buscar por foto"
            onClick={onPhotoSearch}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A2 2 0 0 1 10 3.5h4a2 2 0 0 1 1.8.9L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
              <circle cx="12" cy="12.5" r="3.4" />
            </svg>
          </button>
        )}
      </div>

      {focused && suggestions.length > 0 && (
        <div className="search-suggestions" role="listbox">
          <div className="search-suggestions-title">Ver búsquedas relacionadas</div>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              className="search-suggestion-item"
              onClick={() => selectSuggestion(s)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
