// Placeholder de foto: mientras no hay una imagen real del producto (o no
// se encontró ninguna), en vez del ícono gris genérico de antes mostramos
// un cuadrado de color con las iniciales del producto — mismo criterio que
// "Leche La Serenísima" -> "LS". Es puramente visual (no identifica marca
// ni nada por el estilo), pero rompe la monotonía de filas grises cuando
// todavía no cargaron las fotos.

const PALETTE_SIZE = 6;

// Dos letras: primera + primera de la segunda palabra si hay ("Leche
// entera" -> "LE" quedaría raro comparado con "La Serenísima" -> "LS", así
// que priorizamos la MARCA cuando la tenemos separada del nombre; para eso
// este helper recibe el string que ya se quiera usar como fuente (nombre
// completo o marca) y el llamador decide cuál pasarle).
export function getInitials(source: string): string {
  const words = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Hash simple y estable: mismo nombre siempre cae en el mismo color, así
// no "parpadea" de un color a otro entre renders o entre la vidriera y el
// catálogo para el mismo producto.
export function getMonogramIndex(source: string): number {
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTE_SIZE;
}
