import Link from 'next/link';
import Footer from '@/components/Footer';
import { LegalDisclaimer, Section, SubTitle, LAST_UPDATED } from '@/components/LegalSection';

export const metadata = {
  title: 'Política de privacidad — No Te Afanen',
  description: 'Qué datos recopila No Te Afanen, para qué los usa y con quién los comparte.',
};

export default function PrivacidadPage() {
  return (
    <>
    <div className="wrap" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <Link href="/legal" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        ← Legales
      </Link>

      <h1 style={{ fontSize: 24, marginTop: 18, marginBottom: 4 }}>Política de privacidad</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 28 }}>
        Última actualización: {LAST_UPDATED}. Ver también los{' '}
        <Link href="/legal/terminos">Términos y condiciones</Link>.
      </p>

      <LegalDisclaimer />

      <Section title="1. Quién es responsable de esta app">
        <p>
          <strong>No Te Afanen</strong> es operada por:
        </p>
        <ul>
          <li>Titular: Nicolás Garcete — DNI 50.130.773 — CUIL 20-50130773-5</li>
          <li>Domicilio: Calle 171 N.º 1702, Bernal, Quilmes, Provincia de Buenos Aires, Argentina</li>
          <li>Email de contacto: nicogarcete444@gmail.com</li>
        </ul>
        <p>
          Este dato es obligatorio bajo la Ley 25.326 de Protección de Datos Personales:
          quien recolecta datos tiene que poder ser identificado por quien se los da,
          para que pueda ejercer sus derechos o hacer un reclamo.
        </p>
      </Section>

      <Section title="2. Qué datos recopilamos y para qué">
        <SubTitle>2.1. Si creás una cuenta</SubTitle>
        <ul>
          <li>
            <strong>Email y contraseña</strong>, para que puedas iniciar sesión. La
            contraseña la gestiona nuestro proveedor de autenticación (Supabase) de forma
            encriptada; nosotros no la vemos ni la guardamos en texto plano.
          </li>
          <li>
            <strong>Cookie de sesión</strong>, para mantenerte logueado/a sin que tengas
            que volver a ingresar tus datos en cada visita.
          </li>
          <li>
            <strong>Contenido de tu carrito</strong> (productos que agregaste), asociado a
            tu cuenta, para que lo encuentres igual si volvés a entrar o cambiás de
            dispositivo.
          </li>
        </ul>

        <SubTitle>2.2. Ubicación</SubTitle>
        <p>
          Si das permiso, usamos tu <strong>latitud/longitud</strong> para encontrar
          sucursales cercanas y traerte precios relevantes para tu zona — esto incluye la
          comparación por súper y el feed de &quot;Ofertas cerca tuyo&quot;. Esa ubicación
          se envía a nuestro propio servidor y de ahí a Precios Claros (ver sección 4); no
          la guardamos asociada a tu cuenta ni la usamos con otro fin. Podés negar el
          permiso de ubicación desde el navegador en cualquier momento; sin él, la app no
          puede comparar precios por sucursal.
        </p>

        <SubTitle>2.3. Búsquedas y escaneo de código de barras</SubTitle>
        <p>
          Lo que escribís en el buscador se envía a Precios Claros (a través de nuestro
          servidor) para encontrar productos. Si usás el escáner de código de barras, el
          código se envía directamente desde tu navegador a Open Food Facts para
          identificar el producto (ver sección 4).
        </p>

        <SubTitle>2.4. Si te suscribís a Premium</SubTitle>
        <p>
          El alta de Premium se coordina por WhatsApp. Cuando tocás &quot;Quiero
          Premium&quot;, se abre un chat con un mensaje ya escrito que incluye el email
          de tu cuenta — lo necesitamos para saber a qué cuenta activarle los
          beneficios. Al escribirnos vas a compartir con nosotros tu número de
          teléfono, como en cualquier chat de WhatsApp.
        </p>
        <p>
          No procesamos pagos dentro de la app ni pedimos datos de tarjeta en ningún
          momento: si alguna vez ves una pantalla dentro de No Te Afanen pidiéndote
          datos de tarjeta, no es nuestra. De tu cuenta Premium solo guardamos que
          está activa y hasta qué fecha.
        </p>

        <SubTitle>2.5. Lo que no recopilamos</SubTitle>
        <p>
          Hoy la app no usa cookies de publicidad ni de análisis de terceros (por ejemplo,
          Google Analytics o Meta Pixel), no guarda tu ubicación exacta de forma
          permanente, y no procesa ni almacena datos de tarjetas o medios de pago (no
          hay ningún cobro automático dentro de la app).
        </p>
      </Section>

      <Section title="3. Con qué base legal tratamos tus datos">
        <ul>
          <li>
            <strong>Ejecución de un servicio que vos pediste</strong>: crear tu cuenta y
            guardar tu carrito solo tiene sentido si te registrás vos mismo/a.
          </li>
          <li>
            <strong>Tu consentimiento</strong>: para la ubicación y para la cámara, que el
            navegador te los pide explícitamente y podés rechazar.
          </li>
        </ul>
        <p>No usamos tus datos para fines distintos de los descriptos acá.</p>
      </Section>

      <Section title="4. De dónde salen los precios, sucursales e imágenes">
        <p>Los datos de productos que se muestran en la app no los generamos nosotros:</p>
        <ul>
          <li>
            <strong>Precios, sucursales y catálogo de productos</strong>: provienen de{' '}
            <strong>Precios Claros</strong> (preciosclaros.gob.ar), el sistema oficial de
            transparencia de precios de la Secretaría de Comercio de la Nación, creado
            bajo la Ley de Góndolas y normativa de defensa del consumidor. Cada cadena
            reportante sube sus propios precios; nosotros solo los mostramos tal cual los
            informa esa API pública. Pueden existir diferencias entre lo que ves acá y el
            precio real en la góndola, porque la actualización depende de cada comercio.
          </li>
          <li>
            <strong>Fotos de producto</strong>: provienen de{' '}
            <strong>Open Food Facts</strong> (openfoodfacts.org), una base de datos
            colaborativa y pública, consultada por código de barras. No todos los
            productos tienen foto disponible.
          </li>
        </ul>
        <p>
          No somos responsables por errores, demoras o inexactitudes en los datos que
          estas fuentes públicas informan. Si ves un precio que te parece mal cargado, lo
          correcto es reportarlo directamente a Precios Claros, ya que es su fuente
          original.
        </p>
      </Section>

      <Section title="5. Con quién se comparten tus datos">
        <ul>
          <li>
            <strong>Supabase</strong> (proveedor de base de datos y autenticación): aloja
            tu email, tu contraseña encriptada y tu carrito.
          </li>
          <li>
            <strong>Precios Claros / Open Food Facts</strong>: reciben tu ubicación
            aproximada y tus términos de búsqueda o el código de barras escaneado, solo
            para devolverte el resultado (no les mandamos tu email ni tu identidad).
          </li>
          <li>
            <strong>Vercel</strong> (o el hosting donde corra la app): procesa las
            solicitudes técnicas para que la app funcione.
          </li>
          <li>
            <strong>WhatsApp (Meta)</strong>: si nos escribís para darte de alta o de
            baja el Premium, esa conversación pasa por WhatsApp y se rige por sus
            propios términos y política de privacidad. Nosotros vemos el mensaje que
            nos mandás, tu número y el email que incluye el mensaje.
          </li>
        </ul>
        <p>
          <strong>
            No vendemos ni cedemos tus datos personales a terceros con fines comerciales.
          </strong>{' '}
          Si en el futuro se suma publicidad o links de afiliados, esta sección y la
          de cookies se van a actualizar antes de activarlos, y se va a avisar en la
          app.
        </p>
      </Section>

      <Section title="6. Publicidad y monetización futura">
        <p>
          Hoy la app no muestra publicidad ni usa links de afiliados. Si eso cambia en el
          futuro, vamos a: (a) actualizar esta política antes de activarlo, (b) informar
          qué cookies o identificadores usa cada red publicitaria o afiliado, y (c) pedir
          tu consentimiento cuando la normativa lo exija (por ejemplo, para cookies no
          esenciales).
        </p>
      </Section>

      <Section title="7. Tus derechos sobre tus datos (Ley 25.326)">
        <p>Como usuario/a, tenés derecho a:</p>
        <ul>
          <li><strong>Acceso</strong>: pedir qué datos tuyos tenemos.</li>
          <li><strong>Rectificación</strong>: corregir datos incorrectos o desactualizados.</li>
          <li><strong>Actualización</strong>: mantenerlos al día.</li>
          <li><strong>Supresión</strong>: pedir que borremos tu cuenta y tus datos.</li>
          <li>
            <strong>Retirar tu consentimiento</strong> en cualquier momento (por ejemplo,
            revocando el permiso de ubicación o de cámara desde el navegador).
          </li>
        </ul>
        <p>
          Para ejercer cualquiera de estos derechos, escribinos a nicogarcete444@gmail.com.
          También podés eliminar tu cuenta vos mismo/a desde la app si
          agregamos esa opción, o pedirlo por mail mientras tanto.
        </p>
        <p style={{ marginTop: 10 }}>
          <strong>
            La Agencia de Acceso a la Información Pública (AAIP)
          </strong>{' '}
          es el órgano de control de la Ley 25.326 en Argentina. Si considerás que no
          resolvimos tu reclamo, tenés derecho a hacer una denuncia ante ella
          (argentina.gob.ar/aaip).
        </p>
      </Section>

      <Section title="8. Seguridad y conservación de los datos">
        <p>
          Usamos proveedores (Supabase, Vercel) con medidas de seguridad estándar de la
          industria (conexión encriptada HTTPS, contraseñas hasheadas, aislamiento de
          datos por usuario mediante Row Level Security). Ningún sistema es 100% infalible,
          así que no podemos garantizar seguridad absoluta.
        </p>
        <p>
          Conservamos tu email, tu carrito y tu cuenta mientras la mantengas activa. Si
          pedís que la borremos, eliminamos esos datos salvo que una norma nos obligue a
          conservar algo (por ejemplo, por un reclamo en curso).
        </p>
      </Section>

      <Section title="9. Menores de edad">
        <p>
          La app no está dirigida a menores de 13 años. Si sos padre/madre/tutor y creés
          que un menor a tu cargo nos dio datos personales, escribinos para eliminarlos.
        </p>
      </Section>

      <Section id="contacto" title="10. Contacto">
        <p>
          Para cualquier consulta sobre esta política o sobre tus datos:{' '}
          nicogarcete444@gmail.com.
        </p>
      </Section>
    </div>

    <Footer />
    </>
  );
}
