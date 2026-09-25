'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getPasswordChecks, getPasswordStrength, meetsPasswordPolicy } from '@/lib/passwordStrength';

// A donde /auth/callback redirige el link de "recuperar contraseña" (con
// ?next=/actualizar-contrasena, ver login/page.tsx). Para cuando se llega
// acá, exchangeCodeForSession ya dejó una sesión temporal de recuperación
// puesta en las cookies: alcanza con llamar updateUser({password}) usando
// esa sesión, no hace falta pedir la contraseña vieja.
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Si alguien entra a esta URL directo, sin pasar por el link del mail,
    // no hay sesión de recuperación: no tiene sentido mostrarle un
    // formulario que va a fallar al enviarlo.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setReady(true);
    });
  }, [router]);

  const passwordChecks = getPasswordChecks(password);
  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!meetsPasswordPolicy(password)) {
      setError('La contraseña tiene que cumplir los cuatro requisitos de abajo.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      console.error('[auth]', updateError.message);
      setError('No pudimos actualizar la contraseña. Probá de nuevo en un momento.');
      return;
    }
    setDone(true);
  }

  if (!ready) return <div className="auth-wrap" />;

  if (done) {
    return (
      <div className="auth-wrap">
        <BrandMark />
        <div className="auth-card">
          <div className="auth-check-email">
            <div className="auth-check-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div className="auth-check-title">Contraseña actualizada</div>
            <div className="auth-check-sub">Ya podés seguir usando tu cuenta con la contraseña nueva.</div>
            <button
              type="button"
              className="cta-btn secondary"
              style={{ marginTop: 22, width: '100%' }}
              onClick={() => { router.replace('/'); router.refresh(); }}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <BrandMark />
      <div className="auth-card">
        <div className="auth-title">Elegí una contraseña nueva</div>
        <div className="auth-sub">Tiene que ser distinta a la anterior.</div>

        <form onSubmit={handleSubmit}>
          <div className="auth-field auth-field-password">
            <label htmlFor="password">Contraseña nueva</label>
            <div className="auth-input-wrap auth-password-wrap">
              <svg className="auth-input-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-10-7-10-7a18.6 18.6 0 0 1 4.22-5.19M9.9 4.24A9.6 9.6 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <path d="M1 1l22 22" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {password.length > 0 && (
            <>
              <div className="pw-strength">
                <div className="pw-strength-bars">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="pw-strength-bar"
                      style={i < passwordStrength.score ? { background: passwordStrength.colorVar } : undefined}
                    />
                  ))}
                </div>
                <span className="pw-strength-value" style={{ color: passwordStrength.colorVar }}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="pw-checklist">
                <PwCheckItem met={passwordChecks.length} text="Mínimo de 8 caracteres" />
                <PwCheckItem met={passwordChecks.mixedCase} text="Letras minúsculas y mayúsculas" />
                <PwCheckItem met={passwordChecks.number} text="Al menos 1 número" />
                <PwCheckItem met={passwordChecks.symbol} text="Al menos 1 símbolo" />
              </div>
            </>
          )}

          {error && (
            <div className="auth-error">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          <button type="submit" className="cta-btn" disabled={loading} style={{ width: '100%' }}>
            {loading && <span className="cta-spinner" aria-hidden="true" />}
            {loading ? 'Un momento...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="auth-brand">
      <span className="auth-brand-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
          <circle cx="9.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
          <circle cx="16.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
        </svg>
      </span>
      <span className="auth-brand-name">No Te Afanen</span>
    </div>
  );
}

function PwCheckItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`pw-check-item${met ? ' met' : ''}`}>
      <span className="pw-check-dot">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {text}
    </div>
  );
}
