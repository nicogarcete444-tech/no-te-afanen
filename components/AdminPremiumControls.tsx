'use client';

import { useState, useTransition } from 'react';
import { grantPremium, revokePremium } from '@/app/admin/actions';

export default function AdminPremiumControls({
  userId,
  premium,
  vencidoOSinFecha,
}: {
  userId: string;
  premium: boolean;
  // true si no tiene premium vigente, o si lo tiene pero ya venció / está
  // por vencer — en ambos casos el botón dice "dar" en vez de "renovar".
  vencidoOSinFecha: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGrant() {
    setError(null);
    startTransition(async () => {
      const res = await grantPremium(userId);
      if (!res.ok) setError(res.error);
    });
  }

  function handleRevoke() {
    if (!confirm('¿Quitarle el Premium a este usuario ya mismo?')) return;
    setError(null);
    startTransition(async () => {
      const res = await revokePremium(userId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="admin-premium-controls">
      <button className="admin-btn admin-btn-grant" onClick={handleGrant} disabled={pending}>
        {pending ? '...' : premium && !vencidoOSinFecha ? '+30 días' : 'Dar premium'}
      </button>
      {premium && (
        <button className="admin-btn admin-btn-revoke" onClick={handleRevoke} disabled={pending}>
          Quitar
        </button>
      )}
      {error && <div className="admin-btn-error">{error}</div>}
    </div>
  );
}
