'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getPasswordChecks, getPasswordStrength, meetsPasswordPolicy } from '@/lib/passwordStrength';

// Ilustración de la pantalla de acceso: alguien guardando una moneda en una
// alcancía, la idea de "ahorro" bien directa. Es una imagen (no SVG dibujado
// a mano) que ya trae su propio fondo lila, así que el panel la muestra a
// pantalla completa (cover) en vez de flotarla sobre un segundo fondo.
function AuthIllustration() {
  return (
    <img
      src="/piggy-savings.webp"
      alt="Guardando ahorros en una alcancía"
      width={280}
      height={200}
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'check-email' | 'forgot' | 'forgot-sent' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si /auth/callback no pudo confirmar el link (vencido, ya usado, etc.)
  // manda para acá con ?error=confirm. Se lee del lado del cliente (en vez
  // de useSearchParams) para no tener que envolver la página en Suspense
  // solo por este aviso puntual.
  //
  // ?reset=1 es el mismo mecanismo pero para "olvidé mi contraseña": el
  // link del mail pasa primero por /auth/callback (que canjea el code por
  // una sesión de recuperación) y recién ahí vuelve acá con esta marca.
  // Con esa sesión ya puesta (en cookies, la ve este mismo cliente de
  // Supabase), el modo "reset" solo pide la contraseña nueva.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'confirm') {
      setError('Ese link para confirmar el mail ya venció o se usó. Iniciá sesión con tu contraseña.');
      window.history.replaceState(null, '', window.location.pathname);
    } else if (params.get('reset') === '1') {
      setMode('reset');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const passwordChecks = getPasswordChecks(password);
  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();

    if (mode === 'forgot') {
      // Supabase no avisa si el email existe o no (para no dejar
      // enumerar cuentas registradas probando emails al voleo) — por eso
      // acá no hay un caso de "ese email no existe", siempre se muestra
      // la misma pantalla de "revisá tu mail" salvo un error real (email
      // mal formado, rate limit).
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/login?reset=1')}`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setLoading(false);
      if (resetError) {
        setError(traducirError(resetError.message));
        return;
      }
      setMode('forgot-sent');
      return;
    }

    if (mode === 'reset') {
      if (!meetsPasswordPolicy(password)) {
        setError('La contraseña tiene que cumplir los cuatro requisitos de abajo.');
        setLoading(false);
        return;
      }
      // Esto solo funciona porque /auth/callback ya canjeó el code del
      // mail por una sesión de recuperación (cookies puestas antes de
      // llegar acá). Sin esa sesión, updateUser rechaza el cambio.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (updateError) {
        setError(traducirError(updateError.message));
        return;
      }
      router.replace('/');
      router.refresh();
      return;
    }

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

  if (mode === 'forgot-sent') {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-check-email">
          <div className="auth-check-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="auth-check-title">Te mandamos un link para elegir una contraseña nueva</div>
          <div className="auth-check-sub">
            Si existe una cuenta con <strong>{email}</strong>, te va a llegar un mail con el link. Abrilo
            desde este mismo celular o compu para volver acá ya logueado y poder cambiarla.
          </div>
          <button
            type="button"
            className="cta-btn secondary"
            style={{ marginTop: 22, width: '100%' }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Volver a iniciar sesión
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
          onClick={() => (mode === 'forgot' || mode === 'reset' ? setMode('login') : router.back())}
          aria-label="Volver"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Volver
        </button>
        <div className="auth-brand">
          <span className="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
              <circle cx="9.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
              <circle cx="16.5" cy="19" r="1.3" fill="var(--accent)" stroke="none" />
            </svg>
          </span>
          <span className="auth-brand-name">No Te Afanen</span>
        </div>

        <div className="auth-illustration-panel">
          <AuthIllustration />
        </div>

        <div className="auth-title auth-title-center">
          {mode === 'login' && 'Entrá a tu cuenta'}
          {mode === 'signup' && 'Creá tu cuenta'}
          {mode === 'forgot' && 'Recuperar contraseña'}
          {mode === 'reset' && 'Elegí una contraseña nueva'}
        </div>
        <div className="auth-sub auth-sub-center">
          {mode === 'login' && 'Tu carrito y tus comparaciones te esperan.'}
          {mode === 'signup' && 'Un minuto y tenés tu carrito guardado en cualquier celu.'}
          {mode === 'forgot' && 'Escribí tu email y te mandamos un link para elegir una nueva.'}
          {mode === 'reset' && 'Ya podés escribir la que vas a usar de ahora en más.'}
        </div>

        <form onSubmit={handleSubmit}>
          {mode !== 'reset' && (
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <div className="auth-input-wrap">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vos@ejemplo.com"
                />
                <span className="auth-input-icon" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
                    <path d="m3.5 6 8.5 6.5L20.5 6" />
                  </svg>
                </span>
              </div>
            </div>
          )}
          {mode !== 'forgot' && (
          <div className="auth-field auth-field-password">
            <label htmlFor="password">Contraseña</label>
            {/* El botón del ojo se posiciona con top:50% relativo a ESTE
                contenedor, que solo tiene el input adentro (no el label).
                Antes el `position:relative` estaba en el bloque de arriba,
                que incluye el label — el 50% se calculaba sobre label+input
                juntos, así que el ojo terminaba flotando en el borde entre
                los dos, mordido por la esquina redondeada del input. */}
            <div className="auth-password-wrap auth-input-wrap">
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
              <span className="auth-input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
                  <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
                </svg>
              </span>
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

          {mode === 'login' && (
            <div className="auth-forgot-row">
              <button type="button" className="auth-forgot-link" onClick={() => { setMode('forgot'); setError(''); }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {(mode === 'signup' || mode === 'reset') && password.length > 0 && (
            <>
              <div className="pw-strength">
                <div className="pw-strength-bar">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`pw-strength-seg${i < passwordStrength.score ? ' filled' : ''}`}
                      style={i < passwordStrength.score ? ({ '--seg-color': passwordStrength.colorVar } as CSSProperties) : undefined}
                    />
                  ))}
                </div>
                <div className="pw-strength-row">
                  <span className="pw-strength-label">Seguridad de contraseña</span>
                  <span className="pw-strength-value" style={{ color: passwordStrength.colorVar }}>
                    {passwordStrength.label}
                  </span>
                </div>
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
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="cta-btn auth-submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? (
              <span className="cta-btn-spinner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
                Un momento...
              </span>
            ) : mode === 'login' ? (
              'Entrar'
            ) : mode === 'forgot' ? (
              'Enviar link'
            ) : mode === 'reset' ? (
              'Guardar contraseña'
            ) : (
              'Crear cuenta'
            )}
          </button>
        </form>

        {(mode === 'login' || mode === 'signup') && (
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
        {mode === 'forgot' && (
          <div className="auth-switch">
            <button type="button" onClick={() => { setMode('login'); setError(''); }}>
              Volver a iniciar sesión
            </button>
          </div>
        )}
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
  if (msg.includes('New password should be different'))
    return 'Elegí una contraseña distinta de la que ya tenías.';
  if (msg.includes('Auth session missing') || msg.includes('session_not_found'))
    return 'Ese link ya venció o se usó. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".';
  // Cualquier otro error se devuelve genérico: los mensajes crudos de
  // Supabase/GoTrue cuentan detalles del backend (nombres de tablas,
  // proveedores configurados, estado interno de la cuenta) que no le sirven
  // a la persona y sí a alguien que esté sondeando la app. El detalle queda
  // en la consola del navegador de quien lo sufre, para poder debuggear.
  console.error('[auth]', msg);
  return 'No pudimos completar la operación. Probá de nuevo en un momento.';
}
