import Link from 'next/link';
import Footer from '@/components/Footer';
import { LegalDisclaimer, Section, LAST_UPDATED } from '@/components/LegalSection';

export const metadata = {
  title: 'Términos y condiciones — No Te Afanen',
  description: 'Condiciones de uso de No Te Afanen: qué es el servicio, Premium y responsabilidades.',
};

export default function TerminosPage() {
  return (
    <>
    <div className="wrap" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <Link href="/legal" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        ← Legales
      </Link>

      <h1 style={{ fontSize: 24, marginTop: 18, marginBottom: 4 }}>Términos y condiciones</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 28 }}>
        Última actualización: {LAST_UPDATED}. Ver también la{' '}
        <Link href="/legal/privacidad">Política de privacidad</Link>.
      </p>

      <LegalDisclaimer />

      <Section title="1. Quién presta este servicio">
        <p>
          <strong>No Te Afanen</strong> es operada por:
        </p>
        <ul>
          <li>Titular: Nicolás Garcete — DNI 50.130.773 — CUIL 20-50130773-5</li>
          <li>Domicilio: Calle 171 N.º 1702, Bernal, Quilmes, Provincia de Buenos Aires, Argentina</li>
          <li>Email de contacto: nicogarcete444@gmail.com</li>
        </ul>
      </Section>

      <Section title="2. Qué es No Te Afanen">
        <p>
          No Te Afanen es un comparador de precios de supermercados. No vende productos,
          no procesa pagos y no es un supermercado ni está afiliada a ninguna de las
          cadenas que aparecen en la app (Coto, Carrefour, Día, Jumbo, u otras). Es una
          herramienta independiente que muestra información pública de precios para que
          puedas comparar antes de comprar.
        </p>
      </Section>

      <Section title="3. Condiciones de uso">
        <ul>
          <li>
            La información de precios es orientativa. El precio final puede variar en el
            local. Siempre confirmá el precio en la góndola o en la caja.
          </li>
          <li>No garantizamos disponibilidad ininterrumpida del servicio.</li>
          <li>
            Sos responsable de la información que cargás al crear tu cuenta (por ejemplo,
            usar un email real y una contraseña segura).
          </li>
          <li>
            No está permitido usar la app para hacer scraping masivo, sobrecargar
            nuestros servidores, ni redistribuir los datos de precios como si fueran
            propios.
          </li>
          <li>
            <strong>Premium</strong>: se activa por mes y <strong>no se renueva
            solo</strong> — cuando se termina el mes, tu cuenta vuelve al plan free sin
            que se te cobre nada de nuevo. En la sección Premium de la app podés ver
            hasta qué fecha lo tenés activo. Si querés darlo de baja antes de esa fecha,
            el mismo botón te abre el WhatsApp con el mensaje de baja ya escrito: la
            baja se pide por el mismo medio que el alta, como corresponde. No
            reembolsamos meses ya cobrados.
          </li>
        </ul>
      </Section>

      <Section title="4. Fuentes de datos">
        <p>
          Los precios, sucursales, catálogo y fotos que se muestran vienen de fuentes
          públicas de terceros (Precios Claros y Open Food Facts), no de nosotros. Los
          detalles de qué se comparte con ellas están en la{' '}
          <Link href="/legal/privacidad">Política de privacidad</Link>. No somos
          responsables por errores, demoras o inexactitudes en esos datos.
        </p>
      </Section>

      <Section id="contacto" title="5. Contacto">
        <p>
          Para cualquier consulta sobre estos términos:{' '}
          nicogarcete444@gmail.com.
        </p>
      </Section>
    </div>

    <Footer />
    </>
  );
}
