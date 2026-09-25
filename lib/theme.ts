// Tema claro/oscuro.
//
// Antes el tema vivía en un useState('light') adentro de StoreApp y el
// atributo data-theme se pintaba en un <div> intermedio. Eso traía dos
// problemas reales:
//
//   1. Se perdía en cada recarga: elegías oscuro, volvías a entrar y estaba
//      claro otra vez.
//   2. Al estar en un div y no en <html>, el fondo del documento (lo que se
//      ve al hacer scroll de más, la barra del navegador, las pantallas de
//      login/legales/admin) seguía siendo blanco aunque la app estuviera en
//      oscuro.
//
// Acá queda centralizado: se guarda la elección, y el DEFAULT es siempre
// claro (ya no se sigue la preferencia del sistema operativo) hasta que la
// persona lo cambie a mano desde el toggle del header.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nta-theme';

// Mismos valores que --bg en globals.css. Se usan para la barra del
// navegador (meta theme-color), así que tienen que seguir a ese fondo.
export const THEME_BG: Record<Theme, string> = {
  light: '#F7F7F5',
  dark: '#0E0E12',
};

export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    // localStorage puede tirar error en modo privado de algunos navegadores.
    return null;
  }
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? 'light';
}

export function applyTheme(theme: Theme, persist = false) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_BG[theme]);
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // idem: si no se puede guardar, al menos el tema de esta sesión cambió.
    }
  }
}

// Script que corre ANTES del primer pintado (va inline en el <head>, ver
// app/layout.tsx). Sin esto, la app arrancaría siempre en claro y recién al
// hidratar React saltaría al tema guardado: ese parpadeo se siente como
// "app hecha a las apuradas". Ya no mira prefers-color-scheme: si no hay
// nada guardado, arranca en claro.
export const THEME_BOOT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:'light';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'${THEME_BG.dark}':'${THEME_BG.light}');}catch(e){}})();`;
