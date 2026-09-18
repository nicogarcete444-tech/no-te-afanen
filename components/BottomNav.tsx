export type BottomNavTab = 'inicio' | 'buscar' | 'carrito' | 'compras' | 'perfil' | 'escanear';

const ITEMS: { id: BottomNavTab; label: string }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'compras', label: 'Mis compras' },
  { id: 'escanear', label: 'Escanear' },
  { id: 'carrito', label: 'Comparar' },
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
    case 'buscar':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
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
          <rect x="4" y="7" width="16" height="14" rx="2" />
          <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" />
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
  return (
    <nav className="bottom-nav">
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
