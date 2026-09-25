import type { Metadata } from 'next';

// Mismo motivo que app/login/layout.tsx: la página es 'use client' (maneja
// estado del formulario) y no puede exportar metadata directamente.
export const metadata: Metadata = {
  title: 'Nueva contraseña — No Te Afanen',
  robots: { index: false, follow: false },
};

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
