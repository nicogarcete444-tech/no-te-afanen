'use client';

import { useEffect, useState } from 'react';

// 'buscar' ya no existe como pestaña: el buscador vive fijo en el header,
// a la vista todo el tiempo, así que un botón que solo hacía scroll hasta
// arriba y enfocaba el campo dejó de tener sentido.
export type BottomNavTab = 'inicio' | 'carrito' | 'compras' | 'perfil' | 'escanear';

// La barra es `position:fixed`, así que sin esto queda flotando siempre a
// la misma altura — incluido encima del Footer, cuando la persona llega al
// final de la página (ahí tapaba "Términos y condiciones", "Política de
// privacidad", etc.). La escondemos apenas el final de la página (donde
// vive el Footer) entra en pantalla, y la volvemos a mostrar en cuanto se
// aleja de ahí, sea porque volvió a subir o porque la página cambió de
// alto (nuevos productos cargados, etc.).
function useHideNearPageEnd(thresholdPx = 140) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function update() {
      const doc = document.documentElement;
      const distanceToBottom = doc.scrollHeight - (window.scrollY + window.innerHeight);
      setHidden(distanceToBottom < thresholdPx);
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    // El alto de la página cambia solo (se cargan más productos, se abre/
    // cierra un acordeón, etc.) sin que haya scroll de por medio; con solo
    // los listeners de arriba, la barra podía quedar escondida "de más" o
    // tapando el footer hasta el próximo scroll. ResizeObserver detecta esos
    // cambios de alto directamente.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [thresholdPx]);

  return hidden;
}

const ITEMS: { id: BottomNavTab; label: string }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'compras', label: 'Ahorros' },
  { id: 'escanear', label: 'Escanear' },
  // Decía "Comparar" con un ícono de carrito y el globito de cuántos
  // productos llevás: el botón abre el carrito, comparar es lo que hacés
  // adentro. El nombre ahora coincide con lo que pasa al tocarlo.
  { id: 'carrito', label: 'Carrito' },
  { id: 'perfil', label: 'Perfil' },
];

function TabIcon({ id, active, forceColor }: { id: BottomNavTab; active: boolean; forceColor?: string }) {
  const stroke = forceColor ?? (active ? 'var(--purple-2)' : 'var(--ink-faint)');
  const common = {
    width: 21,
    height: 21,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: active ? 2 : 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (id) {
    case 'inicio':
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case 'carrito':
      return (
        <svg {...common}>
          <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
          <circle cx="9.5" cy="19" r="1.3" fill={stroke} stroke="none" />
          <circle cx="16.5" cy="19" r="1.3" fill={stroke} stroke="none" />
        </svg>
      );
    case 'compras':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.3v9.4" />
          <path d="M14.6 9.4c0-1-1-1.8-2.6-1.8s-2.7.7-2.7 1.7c0 2.6 5.3 1.1 5.3 3.6 0 1.1-1.2 1.8-2.7 1.8s-2.7-.7-2.7-1.8" />
        </svg>
      );
    case 'escanear':
      return (
        <svg {...common}>
          <path d="M3 8V5a2 2 0 0 1 2-2h3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M6 9v6" strokeWidth={active ? 2 : 1.8} />
          <path d="M9 9v6" strokeWidth={2.6} />
          <path d="M12 9v6" strokeWidth={active ? 2 : 1.8} />
          <path d="M14.5 9v6" strokeWidth={1.4} />
          <path d="M17 9v6" strokeWidth={2.6} />
          <path d="M19.5 9v6" strokeWidth={active ? 2 : 1.8} />
        </svg>
      );
    case 'perfil':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M4.5 20c1.4-3.8 4.4-5.7 7.5-5.7s6.1 1.9 7.5 5.7" />
        </svg>
      );
  }
}

export default function BottomNav({
  active,
  cartCount,
  cartPop,
  onSelect,
}: {
  active: BottomNavTab;
  cartCount: number;
  cartPop: boolean;
  onSelect: (tab: BottomNavTab) => void;
}) {
  const hidden = useHideNearPageEnd();

  return (
    <nav className={`bottom-nav${hidden ? ' bottom-nav-hidden' : ''}`}>
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        const isRaised = item.id === 'escanear';
        return (
          <button
            key={item.id}
            className={`bottom-nav-item${isActive ? ' active' : ''}${isRaised ? ' raised' : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="bottom-nav-icon">
              {isRaised ? (
                <TabIcon id={item.id} active forceColor="#fff" />
              ) : (
                <TabIcon id={item.id} active={isActive} />
              )}
              {item.id === 'carrito' && cartCount > 0 && (
                <span className={`cart-badge bottom-nav-badge${cartPop ? ' pop' : ''}`}>{cartCount}</span>
              )}
            </span>
            {!isRaised && <span className="bottom-nav-label">{item.label}</span>}
            {isActive && !isRaised && <span className="bottom-nav-indicator" />}
          </button>
        );
      })}
    </nav>
  );
}
