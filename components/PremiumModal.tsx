'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FREE_CART_PRODUCT_LIMIT, getPremiumStatus, premiumExpiresAt } from '@/lib/premium';
import { FREE_ALERT_LIMIT } from '@/lib/priceAlerts';
import { FREE_COMPARE_LIMIT } from '@/lib/compareLimit';
import {
  PREMIUM_MONTHLY_PRICE_ARS,
  formatArs,
  premiumCancelWhatsappLink,
  premiumWhatsappLink,
} from '@/lib/premiumPricing';

// Comparación de beneficios. Los números salen de las mismas constantes que
// aplica el resto del código (antes estaban escritos a mano acá y el "3 por
// semana" podía quedar desincronizado de FREE_COMPARE_LIMIT sin que nadie se
// enterara).
const ROWS: { label: string; free: string; premium: string }[] = [
  { label: 'Productos en el carrito', free: `Hasta ${FREE_CART_PRODUCT_LIMIT}`, premium: 'Sin límite' },
  { label: 'Comparaciones por semana', free: `${FREE_COMPARE_LIMIT} por semana`, premium: 'Sin límite' },
  { label: 'Alertas de bajada de precio', free: `Hasta ${FREE_ALERT_LIMIT}`, premium: 'Sin límite' },
  { label: 'Tarjeta prolija para compartir (imagen)', free: '—', premium: 'Sí' },
];

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PremiumModal({
  open,
  onClose,
  premium,
  userId,
  userEmail,
}: {
  open: boolean;
  onClose: () => void;
  premium: boolean;
  userId: string | null;
  userEmail: string | null;
}) {
  const router = useRouter();
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  // Hasta cuándo le dura el premium. Se lee recién al abrir el modal (es el
  // único lugar donde se muestra) para no sumar una consulta a cada carga.
  useEffect(() => {
    if (!open || !premium || !userId) {
      setExpiresAt(null);
      return;
    }
    let cancelled = false;
    getPremiumStatus(userId).then((row) => {
      if (!cancelled) setExpiresAt(premiumExpiresAt(row));
    });
    return () => {
      cancelled = true;
    };
  }, [open, premium, userId]);

  // Cerrar con Escape, como cualquier modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleAlta() {
    if (!userId) {
      // Sin cuenta no hay a quién darle de alta el premium (premium_status se
      // escribe por user_id). Lo mandamos a registrarse primero.
      onClose();
      router.push('/login');
      return;
    }
    window.open(premiumWhatsappLink(userEmail), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="cart-overlay show" onClick={onClose}>
      <div className="cart-sheet" role="dialog" aria-modal="true" aria-label="Premium" onClick={(e) => e.stopPropagation()}>
        <div className="cart-sheet-head">
          <h3>Premium</h3>
          <button className="cart-sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="cart-sheet-list">
          {premium ? (
            <div className="premium-status premium-status-active">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {expiresAt ? `Sos Premium hasta el ${fmtFecha(expiresAt)}` : 'Ya sos Premium'}
            </div>
          ) : (
            <div className="premium-status">Estás en el plan free</div>
          )}

          <table className="premium-table">
            <thead>
              <tr>
                <th></th>
                <th>Free</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className={r.free === '—' ? 'no' : ''}>{r.free}</td>
                  <td className={`premium-col${r.premium === '—' ? ' no' : ''}`}>{r.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!premium && (
            <>
              <button className="cta-btn" style={{ width: '100%', marginTop: 18 }} onClick={handleAlta}>
                {`Quiero Premium — ${formatArs(PREMIUM_MONTHLY_PRICE_ARS)}/mes`}
              </button>
              <div className="cart-sheet-footnote" style={{ marginTop: 10 }}>
                {userId
                  ? 'Te abre WhatsApp con el mensaje ya escrito (con tu email, para poder darte de alta) y coordinamos por ahí.'
                  : 'Primero creá tu cuenta: el Premium queda atado a tu email.'}
              </div>
            </>
          )}

          {premium && (
            <>
              <a
                className="cta-btn secondary premium-cancel-btn"
                href={premiumCancelWhatsappLink(userEmail)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Dar de baja mi Premium
              </a>
              <div className="cart-sheet-footnote" style={{ marginTop: 10 }}>
                {expiresAt
                  ? `Seguís con todos los beneficios hasta el ${fmtFecha(expiresAt)} y no se renueva solo. Si querés darlo de baja antes, escribinos y listo.`
                  : 'La baja se pide por el mismo WhatsApp del alta. No se renueva solo.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
