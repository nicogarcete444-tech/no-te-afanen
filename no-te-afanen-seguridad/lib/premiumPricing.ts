// Precio de la suscripción mensual Premium y armado del link de WhatsApp.
// Vive en un archivo propio, sin otros imports, para poder usarlo tanto en
// código de servidor como en componentes de cliente sin arrastrar el cliente
// de Supabase de por medio.
export const PREMIUM_MONTHLY_PRICE_ARS = 1000;

export function formatArs(amount: number): string {
  return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

// Número de WhatsApp al que llega el pedido de alta Premium (formato wa.me:
// código de país + código de área sin 0/15 + número, todo junto).
//
// Configurable por variable de entorno para no tener que tocar código y
// hacer un deploy si algún día cambia el número. Si no está definida, se usa
// el de siempre.
export const PREMIUM_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_PREMIUM_WHATSAPP || '5491124859960';

// Antes el mensaje era solo "Quiero Premium". Eso llegaba desde un número de
// WhatsApp cualquiera y no había forma de saber a QUÉ cuenta darle de alta:
// premium_status se escribe por user_id, no por teléfono. Ahora el mensaje
// lleva el email de la sesión, que es exactamente el dato que aparece en
// Supabase → Authentication → Users.
export function premiumWhatsappLink(email?: string | null): string {
  const text = email
    ? `¡Hola! Quiero pasarme a Premium en No Te Afanen. Mi cuenta es: ${email}`
    : '¡Hola! Quiero pasarme a Premium en No Te Afanen.';
  return `https://wa.me/${PREMIUM_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

// Baja: la Ley de Defensa del Consumidor (24.240) pide que se pueda dar de
// baja por el mismo medio por el que se dio de alta. Como el alta es por
// WhatsApp, la baja también — pero con el mensaje ya escrito, no un "che,
// escribinos" suelto.
export function premiumCancelWhatsappLink(email?: string | null): string {
  const text = email
    ? `Hola, quiero dar de baja mi Premium en No Te Afanen. Mi cuenta es: ${email}`
    : 'Hola, quiero dar de baja mi Premium en No Te Afanen.';
  return `https://wa.me/${PREMIUM_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
