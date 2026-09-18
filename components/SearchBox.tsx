'use client';

import { useEffect, useRef, useState } from 'react';
import { getRelatedSearches } from '@/lib/relatedSearches';

export default function SearchBox({
  value,
  onChange,
  onPhotoSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onPhotoSearch?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
          type="text"
          placeholder="Buscar producto, marca o categoría..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
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
