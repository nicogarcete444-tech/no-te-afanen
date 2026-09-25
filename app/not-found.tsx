import Link from 'next/link';

// 404 a medida. Sin esto, Next muestra su página genérica en blanco y
// negro, sin nada del diseño de la app — la primera impresión de alguien
// que llegó por un link roto o vencido.
export const metadata = {
  title: 'Página no encontrada — No Te Afanen',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingTop: 28, minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <div className="empty-state" style={{ width: '100%' }}>
        <div style={{ fontSize: 44, fontWeight: 800, fontFamily: 'var(--font-archivo), sans-serif', color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          404
        </div>
        <p style={{ marginTop: 6, fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>
          Esta página no existe.
        </p>
        <p className="empty-state-hint">
          El link puede estar viejo o el producto que buscabas ya no está disponible. Volvé a la
          portada y probá buscarlo de nuevo.
        </p>
        <div className="empty-state-actions">
          <Link href="/" className="cta-btn accent" style={{ width: 'auto', padding: '12px 24px' }}>
            Volver a No Te Afanen
          </Link>
        </div>
      </div>
    </div>
  );
}
