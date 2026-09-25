'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getPasswordChecks, getPasswordStrength, meetsPasswordPolicy } from '@/lib/passwordStrength';

type Mode = 'login' | 'signup' | 'check-email' | 'forgot' | 'forgot-sent';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si /auth/callback no pudo confirmar el link (vencido, ya usado, etc.)
  // manda para acá con ?error=confirm. Se lee del lado del cliente (en vez
  // de useSearchParams) para no tener que envolver la página en Suspense
  // solo por este aviso puntual.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'confirm') {
      setError('Ese link para confirmar el mail ya venció o se usó. Iniciá sesión con tu contraseña.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const passwordChecks = getPasswordChecks(password);
  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const supabase = createClient();

    if (mode === 'forgot') {
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=/actualizar-contrasena`
            : undefined,
      });
      setLoading(false);
      // No confirmamos ni negamos si el mail existe: si el error fuera
      // distinto de un problema real (rate limit, etc.) igual mostramos la
      // pantalla de "revisá tu mail", para no dejar que alguien use este
      // formulario para averiguar qué emails están registrados.
      if (resetError && resetError.message.toLowerCase().includes('rate limit')) {
        setError('Demasiados intentos. Esperá un momento y probá de nuevo.');
        return;
      }
      setMode('forgot-sent');
      return;
    }

    setLoading(true);

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
        // Al confirmar el mail, Supabase manda a /auth/callback con un code
        // (no directo acá): esa ruta lo cambia por la sesión real y recién
        // ahí redirige al inicio, ya logueado. Sin pasar por /auth/callback
        // el code se pierde y la persona queda como invitado.
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
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

  // --- Pantallas de una sola nota (ícono + título + texto), reutilizan el
  // mismo layout que "revisá tu mail" tras registrarte.
  if (mode === 'check-email' || mode === 'forgot-sent') {
    const isSignup = mode === 'check-email';
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
            <div className="auth-check-title">
              {isSignup ? 'Te mandamos un mail para confirmar tu cuenta' : 'Revisá tu mail'}
            </div>
            <div className="auth-check-sub">
              {isSignup ? (
                <>
                  Abrí el mail que te llegó a <strong>{email}</strong> y tocá el link. Apenas lo confirmes, volvés
                  automáticamente al inicio, ya logueado.
                </>
              ) : (
                <>
                  Si <strong>{email}</strong> tiene una cuenta con nosotros, te mandamos un link para elegir una
                  contraseña nueva.
                </>
              )}
            </div>
            <button
              type="button"
              className="cta-btn secondary"
              style={{ marginTop: 22, width: '100%' }}
              onClick={() => { setMode('login'); setError(''); }}
            >
              {isSignup ? 'Ya lo confirmé, iniciar sesión' : 'Volver a iniciar sesión'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isForgot = mode === 'forgot';
  const isSignup = mode === 'signup';

  return (
    <div className="auth-wrap">
      <BrandMark />
      <div className="auth-card">
        <button
          type="button"
          className="auth-back"
          onClick={() => (isForgot ? (setMode('login'), setError('')) : router.back())}
          aria-label="Volver"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Volver
        </button>
        <div className="auth-title">
          {isForgot ? 'Recuperá tu contraseña' : mode === 'login' ? 'Entrá a tu cuenta' : 'Creá tu cuenta'}
        </div>
        <div className="auth-sub">
          {isForgot
            ? 'Ingresá el mail de tu cuenta y te mandamos un link para elegir una nueva.'
            : mode === 'login'
              ? 'Tu carrito y tus comparaciones te esperan.'
              : 'Un minuto y tenés tu carrito guardado en cualquier celu.'}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <div className="auth-input-wrap">
              <svg className="auth-input-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="m4 6.5 8 6 8-6" />
              </svg>
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
          </div>

          {!isForgot && (
            <div className="auth-field auth-field-password">
              <div className="auth-field-label-row">
                <label htmlFor="password">Contraseña</label>
                {mode === 'login' && (
                  <button type="button" className="auth-forgot-link" onClick={() => { setMode('forgot'); setError(''); }}>
                    ¿La olvidaste?
                  </button>
                )}
              </div>
              {/* El botón del ojo se posiciona con top:50% relativo a ESTE
                  contenedor, que solo tiene el input adentro (no el label).
                  Antes el `position:relative` estaba en el bloque de arriba,
                  que incluye el label — el 50% se calculaba sobre label+input
                  juntos, así que el ojo terminaba flotando en el borde entre
                  los dos, mordido por la esquina redondeada del input. */}
              <div className="auth-input-wrap auth-password-wrap">
                <svg className="auth-input-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                </svg>
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
          )}

          {isSignup && password.length > 0 && (
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
            {loading
              ? 'Un momento...'
              : isForgot
                ? 'Mandar link'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Crear cuenta'}
          </button>

          {isSignup && (
            <div className="auth-legal">
              Al crear tu cuenta aceptás nuestros{' '}
              <Link href="/legal/terminos" target="_blank">Términos y condiciones</Link> y nuestra{' '}
              <Link href="/legal/privacidad" target="_blank">Política de privacidad</Link>.
            </div>
          )}
        </form>

        {!isForgot && (
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
        )}
      </div>
    </div>
  );
}

// Identidad de marca arriba de la tarjeta: en el header aparece con el
// nombre de la app al lado, acá sola y centrada, como referencia visual de
// dónde estás entrando (patrón que usan Mercado Libre, Ualá, etc. en sus
// pantallas de login en vez de arrancar directo con el formulario).
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
