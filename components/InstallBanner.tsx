'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Cartel "Instalá la app" arriba de todo, en el flujo de la página (se va
// al scrollear, no queda pegado). Es la PWA: no hay tienda de por medio, es
// la propia web agregada a la pantalla de inicio.
//
// Cómo se comporta según el celular:
//  - Android (Chrome, Samsung Internet, Edge): el navegador avisa con el
//    evento `beforeinstallprompt`. Lo guardamos y el botón dispara el
//    diálogo nativo de instalación con un toque.
//  - iPhone (Safari): Apple no tiene ese evento. El botón abre un mini
//    paso a paso (Compartir → Agregar a inicio).
//  - Si ya está instalada (se abrió como app), si la persona lo cerró con la
//    ×, o si es escritorio: no se muestra.
//
// Vive en layout.tsx y no en StoreApp a propósito: StoreApp muestra un
// esqueleto hasta que carga el carrito, y el evento de instalación puede
// llegar justo en ese rato. Acá ya está escuchando desde el primer montaje.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'nta-install-dismissed';
// Después de cerrarlo no vuelve a aparecer por 14 días.
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // En iOS solo Safari puede "Agregar a inicio" desde el menú Compartir
  // (Chrome/Firefox/Edge iOS también pueden hoy, pero los pasos cambian; nos
  // quedamos con el caso seguro).
  const otherBrowser = /crios|fxios|edgios|opios|gsa\//i.test(ua);
  return iOS && !otherBrowser;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallBanner() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    setIos(isIosSafari());
    setHidden(false);

    function onBeforeInstall(e: Event) {
      // Evita el mini-aviso automático de Chrome: el botón de acá es el
      // que decide cuándo mostrar el diálogo.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
      setHidden(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Solo en la portada: en login, legales y admin sería ruido.
  if (pathname !== '/') return null;
  // Sin forma de instalar (ni evento de Android ni iPhone Safari) no tiene
  // sentido mostrar un botón que no hace nada.
  if (hidden || (!deferred && !ios)) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // sin storage: vuelve en la próxima visita, no pasa nada
    }
  }

  async function handleInstall() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // El evento se puede usar una sola vez.
      setDeferred(null);
      if (outcome === 'accepted') setHidden(true);
      else dismiss();
      return;
    }
    setIosHelpOpen((v) => !v);
  }

  return (
    <div className="install-banner" role="region" aria-label="Instalar la app">
      <div className="install-banner-row">
        <button type="button" className="install-banner-close" aria-label="Cerrar" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="install-banner-icon" src="/icons/icon-192.png" alt="" width="52" height="52" />
        <div className="install-banner-text">
          <strong>App de No Te Afanen</strong>
          <span>Instalala en tu celu para entrar más rápido.</span>
        </div>
        <button type="button" className="install-banner-cta" onClick={handleInstall}>
          Instalar
        </button>
      </div>
      {iosHelpOpen && !deferred && (
        <ol className="install-banner-steps">
          <li>
            Tocá <strong>Compartir</strong>{' '}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>{' '}
            en la barra de Safari.
          </li>
          <li>
            Elegí <strong>Agregar a inicio</strong> y confirmá.
          </li>
        </ol>
      )}
    </div>
  );
}
