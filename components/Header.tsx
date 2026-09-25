'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmt } from '@/lib/format';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  PriceDropNotification,
} from '@/lib/priceAlerts';
import SearchBox from './SearchBox';
import {
  getPushPermissionState,
  hasActivePushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pushSubscription';

export default function Header({
  theme,
  onToggleTheme,
  scrolled,
  userId,
  userEmail,
  isAdmin,
  onLogout,
  onDeleteAccount,
  onOpenSavingsHistory,
  onOpenPremium,
  premium,
  openAccountSignal,
  searchValue,
  onSearchChange,
  onScan,
}: {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  scrolled: boolean;
  userId: string | null;
  userEmail: string | null;
  isAdmin?: boolean;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onOpenSavingsHistory: () => void;
  onOpenPremium: () => void;
  premium: boolean;
  // se incrementa desde afuera (nav inferior, "Perfil") para pedirle al
  // header que abra el panel de cuenta sin tener que levantar todo el
  // estado del menú hasta StoreApp.
  openAccountSignal?: number;
  // globito chiquito junto al ícono de cuenta, para invitar a crear cuenta
  // sin plantar un cartel grande en medio de la página.
  // El buscador vive ahora adentro del header, que es sticky: buscar es lo
  // que la gente entra a hacer, y antes se perdía apenas scrolleabas dos
  // pantallas de catálogo — había que volver hasta arriba de todo para
  // cambiar de búsqueda.
  searchValue: string;
  onSearchChange: (v: string) => void;
  onScan: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  // Invitado: la campana se ve igual, con el puntito rojo hasta que la toca
  // una vez (se guarda en este celular). Arranca en "visto" para no
  // parpadear en el render del servidor.
  const [guestBellSeen, setGuestBellSeen] = useState(true);
  const [notifications, setNotifications] = useState<PriceDropNotification[]>([]);
  // Se sabe cuántos hay sin leer (para el puntito) sin traer la lista entera
  // hasta que la persona realmente abre el panel — ver notas más abajo.
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Estado del push real (aviso al celular con la app cerrada). "unsupported"
  // tapa el botón en navegadores que no lo soportan (ej. Safari viejo/iOS
  // sin la app instalada a la home). "denied" no se puede revertir desde
  // acá — hay que avisarle al usuario que lo habilite desde ajustes.
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'off' | 'on' | 'denied'>('checking');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setPushState('unsupported');
        return;
      }
      const permission = await getPushPermissionState();
      if (permission === 'denied') {
        if (!cancelled) setPushState('denied');
        return;
      }
      const active = await hasActivePushSubscription();
      if (!cancelled) setPushState(active ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleTogglePush() {
    if (pushBusy || pushState === 'unsupported' || pushState === 'denied') return;
    setPushBusy(true);
    if (pushState === 'on') {
      await unsubscribeFromPush();
      setPushState('off');
    } else {
      const ok = await subscribeToPush();
      setPushState(ok ? 'on' : 'off');
    }
    setPushBusy(false);
  }

  // Al montar (o cambiar de usuario) solo se pide el NÚMERO de avisos sin
  // leer, no la lista completa: es lo único que hace falta para la
  // campanita, y así cada carga de página no baja las 20 filas de
  // price_drop_notifications de gente que ni siquiera va a abrir el panel.
  useEffect(() => {
    setNotifications([]);
    setNotifLoaded(false);
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    getUnreadNotificationCount(userId).then((count) => {
      if (!cancelled) setUnreadCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (userId) return;
    try {
      setGuestBellSeen(localStorage.getItem('nta-bell-seen') === '1');
    } catch {
      setGuestBellSeen(false);
    }
  }, [userId]);

  function handleOpenNotifications() {
    setAccountOpen(false);
    setNotifOpen(true);
    if (!userId) {
      setGuestBellSeen(true);
      try {
        localStorage.setItem('nta-bell-seen', '1');
      } catch {
        // sin storage: el puntito vuelve en la próxima visita, no pasa nada
      }
    }
    if (!userId) return;
    // La lista completa (con nombre, precios, etc.) recién se pide acá, al
    // abrir el panel de verdad — no en cada carga de página.
    const hadUnread = unreadCount > 0;
    if (!notifLoaded) {
      setNotifLoaded(true);
      setNotifLoading(true);
      // Se pide con las 20 filas ya marcadas "leídas" en el estado local sin
      // esperar la vuelta de markNotificationsRead: no importa en qué orden
      // terminen las dos consultas, el panel siempre se ve como recién visto.
      getNotifications(userId).then((res) => {
        setNotifications(hadUnread ? res.map((n) => ({ ...n, read: true })) : res);
        setNotifLoading(false);
      });
    } else if (hadUnread) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
    if (hadUnread) {
      setUnreadCount(0);
      markNotificationsRead(userId);
    }
  }

  // Cierra el panel de notificaciones al tocar/cliquear afuera.
  useEffect(() => {
    if (!notifOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (openAccountSignal) setAccountOpen(true);
  }, [openAccountSignal]);

  // Escape cierra los dos paneles del header.
  useEffect(() => {
    if (!accountOpen && !notifOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setAccountOpen(false);
      setNotifOpen(false);
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [accountOpen, notifOpen]);

  // Cierra el menú de cuenta al tocar/cliquear en cualquier otro lado de la
  // pantalla, no solo con las opciones de adentro.
  useEffect(() => {
    if (!accountOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [accountOpen]);

  return (
    <header className={scrolled ? 'scrolled' : ''}>
      <div className="head-row">
        <div className="brand">
          {/* El ícono iba en var(--gold) — un mostaza que no aparece en
              ningún otro lado de la marca (ni en el texto, ni en el
              subtítulo). Era un resto de la paleta vieja, de antes de pasar
              a un sistema con un solo acento. Ahora el ícono es del mismo
              color que el nombre: el logo se lee como una sola pieza. */}
          <span className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
              <circle cx="9.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
              <circle cx="16.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
            </svg>
          </span>
          <div>
            <div className="brand-name">No Te Afanen</div>
            <div className="brand-sub">Comparador de precios</div>
          </div>
        </div>
        <div className="head-actions">
          {/* La campana ya no es solo para cuentas: el invitado también la ve
              (y adentro se le invita a crear cuenta para seguir productos). */}
          <div className="account-menu" ref={notifRef}>
              <button
                className="theme-toggle notif-bell"
                aria-label="Notificaciones"
                onClick={() => (notifOpen ? setNotifOpen(false) : handleOpenNotifications())}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {userId && unreadCount > 0 && <span className="notif-bell-dot">{unreadCount}</span>}
                {!userId && !guestBellSeen && <span className="notif-bell-dot is-plain" aria-hidden="true" />}
              </button>
              {notifOpen && (
                <>
                <div className="account-backdrop" onClick={() => setNotifOpen(false)} />
                <div className="account-panel notif-panel" role="menu">
                  <div className="account-panel-grip" />
                  {!userId ? (
                    <>
                      <div className="notif-title">Avisos de precio</div>
                      <div className="notif-empty">
                        Creá tu cuenta gratis, tocá &quot;Seguir&quot; en un producto y te avisamos cuando suba o baje de precio.
                      </div>
                      <Link className="account-row account-row-accent" href="/login" onClick={() => setNotifOpen(false)}>
                        <AccountIcon name="cuenta" />
                        <span>Crear cuenta</span>
                        <Chevron />
                      </Link>
                    </>
                  ) : (
                  <>
                  <div className="notif-title">Productos que sigo</div>
                  {pushState !== 'unsupported' && (
                    <button
                      className="notif-push-toggle"
                      disabled={pushBusy || pushState === 'checking' || pushState === 'denied'}
                      onClick={handleTogglePush}
                    >
                      {pushState === 'denied' ? (
                        'Notificaciones bloqueadas (habilitalas en ajustes del navegador)'
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            {pushState !== 'on' && <line x1="3" y1="3" x2="21" y2="21" />}
                          </svg>
                          <span>{pushState === 'on' ? 'Avisos push activados — tocá para apagar' : 'Activar avisos push al celular'}</span>
                        </>
                      )}
                    </button>
                  )}
                  {notifLoading ? (
                    <div className="notif-empty">Cargando avisos…</div>
                  ) : notifications.length === 0 ? (
                    <div className="notif-empty">
                      Todavía no hay avisos. Tocá &quot;Seguir&quot; en un producto para que te avisemos si sube o baja de precio.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div className="notif-item" key={n.id}>
                        <div className="notif-item-name">{n.nombre || n.ean}</div>
                        <div className={`notif-item-prices${n.direction === 'subio' ? ' up' : ' down'}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            {n.direction === 'subio' ? (
                              <path d="M6 15l6-6 6 6" />
                            ) : (
                              <path d="M6 9l6 6 6-6" />
                            )}
                          </svg>
                          <span className="notif-item-old">{fmt(n.oldPrice)}</span>
                          <span className="notif-item-new">{fmt(n.newPrice)}</span>
                          <span className="notif-item-pct">{n.direction === 'subio' ? '+' : '-'}{n.pctDrop}%</span>
                        </div>
                      </div>
                    ))
                  )}
                  </>
                  )}
                </div>
                </>
              )}
          </div>

          {/* Acá había un segundo botón de carrito, con su propio globito de
              cantidad, a 40px del que ya vive en la barra de abajo (que está
              además donde llega el pulgar). Dos accesos idénticos a la misma
              hoja no agregan nada y le sacaban aire al header, que ahora
              tiene que hacerle lugar al buscador. */}
          <div className="account-menu" ref={accountRef}>
            <button
              className="theme-toggle"
              aria-label="Cuenta"
              onClick={() => setAccountOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.4" /><path d="M4.5 20c1.4-3.8 4.4-5.7 7.5-5.7s6.1 1.9 7.5 5.7" />
              </svg>
            </button>
            {accountOpen && (
              <>
                {/* Fondo oscuro: en celular el panel es una hoja desde abajo,
                    y sin backdrop quedaba flotando sobre el contenido sin que
                    se entendiera que era un menú abierto. */}
                <div className="account-backdrop" onClick={() => setAccountOpen(false)} />
                <div className="account-panel" role="menu">
                  <div className="account-panel-grip" />
                  <div className="account-head">
                    <div className="account-avatar" aria-hidden="true">
                      {userEmail ? userEmail.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="account-head-text">
                      <div className="account-head-title">
                        {userEmail ? userEmail : 'Estás navegando sin cuenta'}
                      </div>
                      <div className="account-head-sub">
                        {userEmail
                          ? premium
                            ? 'Plan Premium'
                            : 'Plan free'
                          : 'Tu carrito se guarda solo en este celular'}
                      </div>
                    </div>
                  </div>

                  <div className="account-section-label">Preferencias</div>
                  <div className="account-rows">
                    <div className="account-row account-row-switch">
                      <AccountIcon name="tema" />
                      <span>Tema oscuro</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={theme === 'dark'}
                        aria-label="Cambiar tema claro u oscuro"
                        className={`theme-switch${theme === 'dark' ? ' is-on' : ''}`}
                        onClick={onToggleTheme}
                      >
                        <span className="theme-switch-knob" />
                      </button>
                    </div>
                  </div>

                  {userEmail ? (
                    <div className="account-rows">
                      {premium ? (
                        <div className="account-premium-badge">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Ya sos Premium
                        </div>
                      ) : (
                        <button
                          className="account-row account-row-accent"
                          onClick={() => {
                            setAccountOpen(false);
                            onOpenPremium();
                          }}
                        >
                          <AccountIcon name="premium" />
                          <span>Hacerme Premium</span>
                          <Chevron />
                        </button>
                      )}
                      <button
                        className="account-row"
                        onClick={() => {
                          setAccountOpen(false);
                          onOpenSavingsHistory();
                        }}
                      >
                        <AccountIcon name="ahorros" />
                        <span>Mis ahorros</span>
                        <Chevron />
                      </button>
                      <button className="account-row" onClick={handleOpenNotifications}>
                        <AccountIcon name="notificaciones" />
                        <span>Productos que sigo</span>
                        {unreadCount > 0 && <span className="account-row-badge">{unreadCount}</span>}
                        <Chevron />
                      </button>
                      {isAdmin && (
                        <Link className="account-row" href="/admin" onClick={() => setAccountOpen(false)}>
                          <AccountIcon name="admin" />
                          <span>Admin</span>
                          <Chevron />
                        </Link>
                      )}
                      <button
                        className="account-row account-row-danger"
                        onClick={() => {
                          setAccountOpen(false);
                          onLogout();
                        }}
                      >
                        <AccountIcon name="salir" />
                        <span>Cerrar sesión</span>
                      </button>
                      <button
                        className="account-row account-row-danger"
                        onClick={() => {
                          setAccountOpen(false);
                          onDeleteAccount();
                        }}
                      >
                        <AccountIcon name="salir" />
                        <span>Eliminar mi cuenta</span>
                      </button>
                    </div>
                  ) : (
                    <div className="account-rows">
                      <Link className="account-row account-row-accent" href="/login" onClick={() => setAccountOpen(false)}>
                        <AccountIcon name="cuenta" />
                        <span>Iniciar sesión o crear cuenta</span>
                        <Chevron />
                      </Link>
                      <button
                        className="account-row"
                        onClick={() => {
                          setAccountOpen(false);
                          onOpenSavingsHistory();
                        }}
                      >
                        <AccountIcon name="ahorros" />
                        <span>Mis ahorros</span>
                        <Chevron />
                      </button>
                      <button
                        className="account-row"
                        onClick={() => {
                          setAccountOpen(false);
                          onOpenPremium();
                        }}
                      >
                        <AccountIcon name="premium" />
                        <span>Ver qué incluye Premium</span>
                        <Chevron />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="head-search">
        <SearchBox
          value={searchValue}
          onChange={onSearchChange}
          onScan={onScan}
        />
      </div>
    </header>
  );
}

function Chevron() {
  return (
    <svg className="account-row-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function AccountIcon({ name }: { name: 'premium' | 'ahorros' | 'notificaciones' | 'legal' | 'admin' | 'salir' | 'cuenta' | 'tema' }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'premium':
      return (
        <svg {...common}>
          <path d="m12 3 2.6 5.5 6 .85-4.35 4.2 1.05 5.95L12 16.7 6.7 19.5l1.05-5.95L3.4 9.35l6-.85z" />
        </svg>
      );
    case 'ahorros':
      return (
        <svg {...common}>
          <path d="M3 17.5 9 11l4 3.5 8-8.5" />
          <path d="M15 6h6v6" />
        </svg>
      );
    case 'notificaciones':
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 4.5-1.5 6-2 7h16c-.5-1-2-2.5-2-7Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'legal':
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...common}>
          <path d="M12 3 4 6.5v5c0 4.6 3.2 8.5 8 9.5 4.8-1 8-4.9 8-9.5v-5z" />
        </svg>
      );
    case 'cuenta':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M4.5 20c1.4-3.8 4.4-5.7 7.5-5.7s6.1 1.9 7.5 5.7" />
        </svg>
      );
    case 'salir':
      return (
        <svg {...common}>
          <path d="M15 17v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2V7" />
          <path d="M19 12H9m10 0-3-3m3 3-3 3" />
        </svg>
      );
    case 'tema':
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
  }
}
