// Precios Claros trae muchos nombres y marcas TODO EN MAYÚSCULAS
// ("LA SERENISIMA", "LECHE ENTERA SACHET"). En las tarjetas del catálogo eso
// grita y se lee peor, así que acá se pasan a "Tipo Título". Lo que ya viene
// en minúsculas o mezclado se deja tal cual: no se le toca nada a un nombre
// que alguien ya escribió bien.

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'con', 'sin', 'para', 'por', 'en', 'al', 'a']);
// Unidades: "500 G" -> "500 g", no "500 G" ni "500 G".
const UNITS = new Set(['kg', 'g', 'gr', 'grs', 'l', 'lt', 'lts', 'ml', 'cc', 'un', 'u', 'mts', 'm', 'cm', 'mm']);

export function niceCase(input: string | null | undefined): string {
  const text = (input || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';

  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length;
  // Si la mayoría ya está en minúscula, alguien lo escribió a mano: no tocar.
  if (!letters.length || upper / letters.length < 0.6) return text;

  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (UNITS.has(word)) return word;
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
