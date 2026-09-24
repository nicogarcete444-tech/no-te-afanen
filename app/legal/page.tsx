import Link from 'next/link';
import Footer from '@/components/Footer';
import { LegalDisclaimer, Section, LAST_UPDATED } from '@/components/LegalSection';

export const metadata = {
  title: 'Legales — No Te Afanen',
  description: 'Política de privacidad, términos de uso, fuentes de datos y contacto.',
};

export default function LegalPage() {
  return (
    <>
    <div className="wrap" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        ← Volver
      </Link>

      <h1 style={{ fontSize: 24, marginTop: 18, marginBottom: 4 }}>Legales</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 28 }}>
        Última actualización: {LAST_UPDATED}.
      </p>

      <LegalDisclaimer />

      <Section title="Quién es responsable de esta app">
        <p>
          <strong>No Te Afanen</strong> es operada por:
        </p>
        <ul>
          <li>Titular: Nicolás Garcete</li>
          <li>Domicilio: Calle 171 N.º 1702, Bernal, Quilmes, Provincia de Buenos Aires, Argentina</li>
          <li>Email de contacto: nicogarcete444@gmail.com</li>
        </ul>
      </Section>

      <Section title="Qué es No Te Afanen">
        <p>
          No Te Afanen es un comparador de precios de supermercados. No vende productos,
          no procesa pagos y no es un supermercado ni está afiliada a ninguna de las
          cadenas que aparecen en la app (Coto, Carrefour, Día, Jumbo, u otras). Es una
          herramienta independiente que muestra información pública de precios para que
          puedas comparar antes de comprar.
        </p>
      </Section>

      <Section title="Los dos documentos, por separado">
        <p>
          Para que cada uno sea más corto y fácil de encontrar, separamos qué hacemos con
          tus datos de las condiciones de uso del servicio:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <Link href="/legal/privacidad" className="legal-doc-link">
            <strong>Política de privacidad</strong>
            <span>Qué datos recopilamos, para qué, con quién se comparten y tus derechos.</span>
          </Link>
          <Link href="/legal/terminos" className="legal-doc-link">
            <strong>Términos y condiciones</strong>
            <span>Cómo funciona el servicio, Premium, y qué se espera de vos al usarlo.</span>
          </Link>
        </div>
      </Section>

      <Section id="contacto" title="Contacto">
        <p>
          Para cualquier consulta sobre privacidad, términos, o cualquier otra cosa:{' '}
          nicogarcete444@gmail.com.
        </p>
      </Section>
    </div>

    <Footer />
    </>
  );
}
