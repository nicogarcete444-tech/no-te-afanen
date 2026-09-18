import type { Metadata, Viewport } from 'next';
import { Archivo, Inter } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { SITE_URL } from '@/lib/siteUrl';

// next/font descarga los .woff2 en build time y los sirve desde nuestro
// propio dominio (self-hosted): sin el <link rel="stylesheet"> a
// fonts.googleapis.com de antes, que era una request bloqueante extra en la
// cadena crítica (~930ms estimados por Lighthouse en 4G lenta) y encima
// dependía de que Google respondiera rápido. Las variables CSS quedan
// disponibles en <html> y globals.css ya puede usarlas directamente.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  // metadataBase resuelve a absolutas todas las URLs relativas de metadata
  // (canonical, og:image, manifest). Sin esto Next avisa por consola en el
  // build y los buscadores reciben rutas relativas, que ignoran.
  metadataBase: new URL(SITE_URL),
  title: 'No Te Afanen',
  description: 'Comparador de precios de supermercados en Argentina',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'No Te Afanen',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#5B4BE8',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el pinch-zoom deja afuera a cualquiera que
  // necesite agrandar para leer un precio (y es una falla de accesibilidad
  // concreta, WCAG 1.4.4). El layout ya es responsive, no hace falta.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${archivo.variable} ${inter.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
