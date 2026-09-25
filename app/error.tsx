'use client';

import { useEffect } from 'react';

// Error boundary de toda la app. Next exige que sea un client component
// (recibe `error` y `reset` como props). Sin este archivo, un error no
// capturado en un Server Component tira la página de error genérica de
// Next, sin el diseño de la app y sin forma de reintentar sin recargar
// todo a mano.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log en la consola del servidor/navegador para poder rastrearlo.
    // Si en algún momento se suma Sentry u otro monitoreo de errores, este
    // es el lugar donde engancharlo.
    console.error(error);
  }, [error]);

  return (
    <div className="wrap" style={{ paddingTop: 28, minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <div className="empty-state" style={{ width: '100%' }}>
        <p style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>
          Algo salió mal.
        </p>
        <p className="empty-state-hint">
          Fue un error nuestro, no tuyo. Probá de nuevo — si sigue pasando, contactanos desde la
          sección de legales.
        </p>
        <div className="empty-state-actions">
          <button type="button" onClick={reset} className="cta-btn accent" style={{ width: 'auto', padding: '12px 24px' }}>
            Reintentar
          </button>
          <a href="/" className="cta-btn secondary" style={{ width: 'auto', padding: '12px 24px' }}>
            Ir a la portada
          </a>
        </div>
      </div>
    </div>
  );
}
