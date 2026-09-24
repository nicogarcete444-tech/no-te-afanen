// Mapea el nombre de cadena que devuelve Precios Claros (que viene con
// variantes tipo "Supermercados DIA", "Carrefour Market", "COTO CICSA") a
// un logo real. Si no reconocemos la cadena (súper chico, regional, o
// alguno que todavía no tiene logo cargado), mostramos el nombre en texto
// como respaldo — nunca se pierde información.
// Los .webp están recortados a 180px de alto (el tamaño más grande al que se
// usa un logo en la UI son 30px, así que 180px cubre hasta pantallas @6x sin
// desperdiciar KB de más). Antes eran PNG a resolución completa (algunos de
// más de 1000px) y pesaban ~257 KiB combinados; así quedaron en ~39 KiB.
// intrinsicWidth/Height son el tamaño real del archivo: se los pasamos al
// <img> para que el navegador reserve el espacio antes de que cargue (evita
// el salto de layout) sin forzar un recorte, porque cada logo tiene su
// propio aspect ratio.
import { isCarrefour, isChangomas, isCoto, isDia, isDisco, isFarmacity, isJumbo } from '@/lib/chains';

const LOGO_MATCHERS: { test: (n: string) => boolean; src: string; alt: string; intrinsicWidth: number; intrinsicHeight: number }[] = [
  { test: isCarrefour, src: '/logos/carrefour.webp', alt: 'Carrefour', intrinsicWidth: 317, intrinsicHeight: 180 },
  { test: isChangomas, src: '/logos/changomas.webp', alt: 'Changomás', intrinsicWidth: 180, intrinsicHeight: 180 },
  { test: isDisco, src: '/logos/disco.webp', alt: 'Disco', intrinsicWidth: 180, intrinsicHeight: 180 },
  { test: isJumbo, src: '/logos/jumbo.webp', alt: 'Jumbo', intrinsicWidth: 180, intrinsicHeight: 180 },
  { test: isCoto, src: '/logos/coto.webp', alt: 'Coto', intrinsicWidth: 539, intrinsicHeight: 180 },
  { test: isDia, src: '/logos/dia.webp', alt: 'Día', intrinsicWidth: 293, intrinsicHeight: 180 },
  { test: isFarmacity, src: '/logos/farmacity.svg', alt: 'Farmacity', intrinsicWidth: 180, intrinsicHeight: 180 },
];

export function getStoreLogo(
  chain: string
): { src: string; alt: string; intrinsicWidth: number; intrinsicHeight: number } | null {
  const n = chain.toLowerCase();
  const match = LOGO_MATCHERS.find((m) => m.test(n));
  return match
    ? { src: match.src, alt: match.alt, intrinsicWidth: match.intrinsicWidth, intrinsicHeight: match.intrinsicHeight }
    : null;
}

// Nombre para mostrar de una cadena: "Supermercados DIA" -> "Día", "Chango
// Mas" -> "Changomás". Si no la reconocemos, el nombre tal cual vino.
export function chainLabel(chain: string): string {
  return getStoreLogo(chain)?.alt ?? chain;
}

export default function StoreLogo({
  chain,
  size = 22,
  className = '',
}: {
  chain: string;
  size?: number;
  className?: string;
}) {
  const logo = getStoreLogo(chain);

  if (!logo) {
    // Cadena sin logo propio todavía: mostramos el nombre tal cual.
    return <span className={`store-logo-fallback ${className}`}>{chain}</span>;
  }

  return (
    <span className={`store-logo-wrap ${className}`} title={chain}>
      <img
        src={logo.src}
        alt={logo.alt}
        className="store-logo-img"
        width={logo.intrinsicWidth}
        height={logo.intrinsicHeight}
        style={{ height: size, width: 'auto' }}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
