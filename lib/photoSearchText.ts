// Convierte el texto crudo que devuelve el OCR (lib/ocr.ts) en un término de
// búsqueda razonable para /api/productos. El OCR de una foto de un paquete
// real trae de todo: renglones de ingredientes, gramaje, códigos, la marca
// en letras grandes arriba... Esto no intenta "leer" el envase entero, solo
// quedarse con la línea que más pinta tiene de ser el nombre del producto,
// para dejársela a la persona como punto de partida editable (nunca se
// dispara la búsqueda sola con esto sin que la vea antes).
const RUIDO = [
  /^\d+([.,]\d+)?\s*(g|gr|grs|kg|ml|l|lt|cc|cm|un|unid|unidades)\.?$/i,
  /^cod(igo)?\.?\s*(de\s*)?barras?/i,
  /^ean/i,
  /contenido neto/i,
  /industria argentina/i,
  /registro nacional/i,
  /^\d{6,}$/, // códigos de barra sueltos
  /vencimiento|elaborado|lote|rnpa|rnE/i,
];

function esRuido(linea: string): boolean {
  return RUIDO.some((r) => r.test(linea.trim()));
}

export function guessSearchTermFromOcr(rawText: string): string {
  const lineas = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\p{L}\p{N}\s.%-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && /[a-zA-ZÀ-ÿ]{3,}/.test(l))
    .filter((l) => !esRuido(l));

  if (!lineas.length) return '';

  // Preferimos renglones cortos y en mayúscula (típico de la marca/nombre
  // impreso grande en el frente del paquete) antes que párrafos largos de
  // ingredientes; entre los candidatos, el más largo suele ser el más
  // descriptivo ("Leche entera larga vida" mejor que solo "Leche").
  const mayusculasCortas = lineas.filter((l) => l === l.toUpperCase() && l.split(' ').length <= 5);
  const pool = mayusculasCortas.length ? mayusculasCortas : lineas;

  const mejor = [...pool].sort((a, b) => b.length - a.length)[0];
  return mejor.slice(0, 60);
}
