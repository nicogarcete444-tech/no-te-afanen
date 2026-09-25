import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/adminAuth';
import { isPremiumStatusActive, premiumExpiresAt } from '@/lib/premium';
import { formatArs, PREMIUM_MONTHLY_PRICE_ARS } from '@/lib/premiumPricing';
import AdminPremiumControls from '@/components/AdminPremiumControls';

export const metadata = {
  title: 'Admin — No Te Afanen',
  // Cinturón y tirantes junto al Disallow de robots.ts: robots.txt es una
  // sugerencia que el crawler puede ignorar, pero esta cabecera/meta la
  // respetan. Si alguien linkea /admin desde afuera, igual no se indexa.
  robots: { index: false, follow: false },
};

// Nada de esto se cachea: son números que querés ver al toque, no una
// página que tenga sentido servir vieja.
export const dynamic = 'force-dynamic';

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Mismo trato para "no logueado" y "logueado pero no admin": no hay que
  // darle pistas a nadie de que esta ruta existe o de por qué no entra.
  if (!isAdminEmail(user?.email)) {
    redirect('/');
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="wrap" style={{ paddingTop: 28, paddingBottom: 64 }}>
        <p>
          Falta configurar <code>SUPABASE_SERVICE_ROLE_KEY</code> para poder mostrar el dashboard.
        </p>
      </div>
    );
  }

  // --- Traemos a TODOS los usuarios registrados (auth.users) -------------
  // listUsers pagina de a 1000; con el volumen de esta app un par de
  // vueltas alcanza siempre, pero el while cubre igual si algún día crece.
  const authUsers: AuthUserRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    authUsers.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }))
    );
    if (data.users.length < 1000) break;
  }

  // --- El resto de las tablas, todas de una ------------------------------
  const [
    { data: premiumRows },
    { data: cartRows },
    { data: alertRows },
    { data: compareRows },
  ] = await Promise.all([
    admin.from('premium_status').select('user_id, is_premium, since, premium_until'),
    admin.from('carts').select('user_id, items'),
    admin.from('price_alerts').select('user_id'),
    admin.from('compare_usage').select('user_id, count'),
  ]);

  const premiumByUser = new Map((premiumRows ?? []).map((r) => [r.user_id as string, r]));

  const cartCountByUser = new Map<string, number>();
  for (const row of cartRows ?? []) {
    const items = (row.items ?? {}) as Record<string, number>;
    const distintos = Object.values(items).filter((qty) => Number(qty) > 0).length;
    if (distintos > 0) cartCountByUser.set(row.user_id as string, distintos);
  }

  const alertCountByUser = new Map<string, number>();
  for (const row of alertRows ?? []) {
    const id = row.user_id as string;
    alertCountByUser.set(id, (alertCountByUser.get(id) ?? 0) + 1);
  }

  const compareCountByUser = new Map<string, number>();
  for (const row of compareRows ?? []) {
    const id = row.user_id as string;
    compareCountByUser.set(id, (compareCountByUser.get(id) ?? 0) + (Number(row.count) || 0));
  }

  // --- Agregados para las tarjetas de arriba ------------------------------
  const totalUsuarios = authUsers.length;
  const activos7 = authUsers.filter((u) => {
    const d = daysAgo(u.last_sign_in_at);
    return d !== null && d <= 7;
  }).length;
  const activos30 = authUsers.filter((u) => {
    const d = daysAgo(u.last_sign_in_at);
    return d !== null && d <= 30;
  }).length;
  const nuevosEstaSemana = authUsers.filter((u) => {
    const d = daysAgo(u.created_at);
    return d !== null && d <= 7;
  }).length;

  const premiumActivos = authUsers.filter((u) => isPremiumStatusActive(premiumByUser.get(u.id))).length;

  const usanCarrito = cartCountByUser.size;
  const usanAlertas = alertCountByUser.size;
  const usanComparador = Array.from(compareCountByUser.values()).filter((c) => c > 0).length;

  const pct = (n: number) => (totalUsuarios > 0 ? Math.round((n / totalUsuarios) * 100) : 0);

  // --- Tabla de usuarios, más recientemente activo primero ----------------
  const filas = authUsers
    .map((u) => {
      const premiumRow = premiumByUser.get(u.id);
      const activo = isPremiumStatusActive(premiumRow);
      const expira = activo ? premiumExpiresAt(premiumRow) : null;
      const vence = expira ? fmtDate(expira.toISOString()) : '—';
      // Cuántos días le quedan: es el dato accionable de verdad (a quién hay
      // que escribirle esta semana para que renueve).
      const diasRestantes = expira ? Math.ceil((expira.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
      return {
        id: u.id,
        email: u.email ?? '(sin email)',
        registrado: fmtDate(u.created_at),
        ultimoIngreso: fmtDate(u.last_sign_in_at),
        ultimoIngresoTs: u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0,
        premium: activo,
        vence,
        diasRestantes,
        carrito: cartCountByUser.get(u.id) ?? 0,
        alertas: alertCountByUser.get(u.id) ?? 0,
        comparaciones: compareCountByUser.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => b.ultimoIngresoTs - a.ultimoIngresoTs);

  const vip = filas.filter((f) => f.premium);

  return (
    <div className="wrap admin-page" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        ← Volver
      </Link>

      <h1 style={{ fontSize: 24, marginTop: 18, marginBottom: 4 }}>Admin</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 24 }}>
        {user?.email} — datos en vivo, no se guardan acá.
      </p>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalUsuarios}</div>
          <div className="admin-stat-label">Usuarios registrados</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{activos7}</div>
          <div className="admin-stat-label">Iniciaron sesión (7 días)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{activos30}</div>
          <div className="admin-stat-label">Iniciaron sesión (30 días)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{nuevosEstaSemana}</div>
          <div className="admin-stat-label">Cuentas nuevas (7 días)</div>
        </div>
        <div className="admin-stat-card admin-stat-highlight">
          <div className="admin-stat-value">{premiumActivos}</div>
          <div className="admin-stat-label">Premium activos — {formatArs(PREMIUM_MONTHLY_PRICE_ARS)}/mes c/u</div>
        </div>
      </div>

      <h2 className="admin-section-title">Qué secciones usan</h2>
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {usanCarrito} <span className="admin-stat-pct">({pct(usanCarrito)}%)</span>
          </div>
          <div className="admin-stat-label">Tienen algo en el carrito</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {usanAlertas} <span className="admin-stat-pct">({pct(usanAlertas)}%)</span>
          </div>
          <div className="admin-stat-label">Usan alertas de bajada</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {usanComparador} <span className="admin-stat-pct">({pct(usanComparador)}%)</span>
          </div>
          <div className="admin-stat-label">Usaron el comparador</div>
        </div>
      </div>

      <h2 className="admin-section-title">Quiénes son VIP ({vip.length})</h2>
      {vip.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Todavía nadie tiene Premium activo.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Vence</th>
                <th>Le quedan</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {vip.map((f) => (
                <tr key={f.id}>
                  <td>{f.email}</td>
                  <td>{f.vence}</td>
                  <td className={f.diasRestantes !== null && f.diasRestantes <= 5 ? 'admin-premium-soon' : ''}>
                    {f.diasRestantes === null
                      ? '—'
                      : f.diasRestantes <= 0
                      ? 'vence hoy'
                      : `${f.diasRestantes} día${f.diasRestantes === 1 ? '' : 's'}`}
                  </td>
                  <td>
                    <AdminPremiumControls
                      userId={f.id}
                      premium={f.premium}
                      vencidoOSinFecha={f.diasRestantes === null || f.diasRestantes <= 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-section-title">Todos los usuarios ({filas.length})</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Registrado</th>
              <th>Último ingreso</th>
              <th>Plan</th>
              <th>Carrito</th>
              <th>Alertas</th>
              <th>Comparaciones</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.email}</td>
                <td>{f.registrado}</td>
                <td>{f.ultimoIngreso}</td>
                <td className={f.premium ? 'admin-premium-yes' : ''}>{f.premium ? 'Premium' : 'Free'}</td>
                <td>{f.carrito || '—'}</td>
                <td>{f.alertas || '—'}</td>
                <td>{f.comparaciones || '—'}</td>
                <td>
                  <AdminPremiumControls
                    userId={f.id}
                    premium={f.premium}
                    vencidoOSinFecha={f.diasRestantes === null || f.diasRestantes <= 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
