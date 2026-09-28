'use client';

import { useEffect } from 'react';

// Registra el service worker (PWA instalable + avisos push).
//
// Antes esto era un <script dangerouslySetInnerHTML> dentro de layout.tsx.
// Como componente de cliente hace exactamente lo mismo, pero sin inyectar
// HTML a mano y sin depender de que el CSP permita scripts inline sueltos.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual: solo se pierde el
      // "instalar en la pantalla de inicio" y los avisos push.
    });
  }, []);

  return null;
}
