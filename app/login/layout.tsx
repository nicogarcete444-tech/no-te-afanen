import type { Metadata } from 'next';

// Este layout existe por un solo motivo: app/login/page.tsx es un componente
// de cliente ('use client', porque maneja estado del formulario) y los
// componentes de cliente no pueden exportar `metadata`. El layout sí, y
// envuelve la misma ruta, así que es el lugar donde declarar el noindex.
//
// Va en tándem con el "Disallow: /login" de robots.ts: robots.txt evita el
// rastreo cuando el crawler lo respeta, y esta meta evita la indexación
// incluso si alguien linkea la ruta desde otro sitio.
export const metadata: Metadata = {
  title: 'Ingresar — No Te Afanen',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
