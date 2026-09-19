'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getPasswordChecks, getPasswordStrength, meetsPasswordPolicy } from '@/lib/passwordStrength';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'check-email'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordChecks = getPasswordChecks(password);
  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();

    if (mode === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(traducirError(signInError.message));
        setLoading(false);
        return;
      }
      router.replace('/');
      router.refresh();
      return;
    }

    // registro: acá se EXIGE la política que la checklist viene mostrando.
    // Antes esta validación no existía en ningún lado (ni acá ni en el
    // servidor) y la lista de requisitos era decorativa.
    if (!meetsPasswordPolicy(password)) {
      setError('La contraseña tiene que cumplir los cuatro requisitos de abajo.');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Al confirmar el mail, Supabase lo manda de vuelta acá y ya queda
        // logueado; desde acá lo mandamos directo al inicio.
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (signUpError) {
      setError(traducirError(signUpError.message));
      setLoading(false);
      return;
    }

    // Si el proyecto de Supabase tiene "Confirm email" activado, no hay
    // sesión todavía: mostramos la pantalla de "revisá tu mail".
    if (data.user && !data.session) {
      setLoading(false);
      setMode('check-email');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  if (mode === 'check-email') {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-check-email">
          <div className="auth-check-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="auth-check-title">Te mandamos un mail para confirmar tu cuenta</div>
          <div className="auth-check-sub">
            Abrí el mail que te llegó a <strong>{email}</strong> y tocá el link. Apenas lo confirmes, volvés
            automáticamente al inicio, ya logueado.
          </div>
          <button
            type="button"
            className="cta-btn secondary"
            style={{ marginTop: 22, width: '100%' }}
            onClick={() => setMode('login')}
          >
            Ya lo confirmé, iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <button
          type="button"
          className="auth-back"
          onClick={() => router.back()}
          aria-label="Volver"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Volver
        </button>
        <div className="auth-title">{mode === 'login' ? 'Entrá a tu cuenta' : 'Creá tu cuenta'}</div>
        <div className="auth-sub">
          {mode === 'login'
            ? 'Tu carrito y tus comparaciones te esperan.'
            : 'Un minuto y tenés tu carrito guardado en cualquier celu.'}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
            />
          </div>
          <div className="auth-field auth-field-password">
            <label htmlFor="password">Contraseña</label>
            {/* El botón del ojo se posiciona con top:50% relativo a ESTE
                contenedor, que solo tiene el input adentro (no el label).
                Antes el `position:relative` estaba en el bloque de arriba,
                que incluye el label — el 50% se calculaba sobre label+input
                juntos, así que el ojo terminaba flotando en el borde entre
                los dos, mordido por la esquina redondeada del input. */}
            <div className="auth-password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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

          {mode === 'signup' && password.length > 0 && (
            <>
              <div className="pw-strength">
                <span className="pw-strength-label">Seguridad de contraseña</span>
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

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="cta-btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              ¿No tenés cuenta?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(''); }}>
                Creá una
              </button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }}>
                Entrá
              </button>
            </>
          )}
        </div>
      </div>
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

function traducirError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('User already registered')) return 'Ya existe una cuenta con ese email.';
  if (msg.includes('Password should be at least')) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (msg.includes('Email not confirmed')) return 'Todavía no confirmaste tu email. Revisá tu correo.';
  if (msg.toLowerCase().includes('rate limit') || msg.includes('Too many'))
    return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
  // Cualquier otro error se devuelve genérico: los mensajes crudos de
  // Supabase/GoTrue cuentan detalles del backend (nombres de tablas,
  // proveedores configurados, estado interno de la cuenta) que no le sirven
  // a la persona y sí a alguien que esté sondeando la app. El detalle queda
  // en la consola del navegador de quien lo sufre, para poder debuggear.
  console.error('[auth]', msg);
  return 'No pudimos completar la operación. Probá de nuevo en un momento.';
}
