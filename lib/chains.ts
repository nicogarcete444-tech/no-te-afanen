// Reconocimiento de cadenas de súper por el nombre que devuelve Precios
// Claros ("Supermercados DIA", "Carrefour Market", "COTO CICSA"...).
//
// Antes cada archivo (logos, links de compra, cadenas prioritarias, cron de
// historial) repetía `n.includes('dia')`. El problema: "diarco" (una cadena
// mayorista que Precios Claros también informa) contiene "dia", así que se
// mostraba con el logo de Día, el nombre "Día" y un botón "Comprar en Día"
// que llevaba a la tienda equivocada. Para una app que promete comparar
// súpers reales, confundir dos cadenas es de los peores errores posibles.
//
// Día se reconoce solo como PALABRA ("dia", "día", "supermercados dia",
// "dia argentina"), nunca como pedazo de otra palabra.

function normalize(chain: string): string {
  return chain.toLowerCase().trim();
}

const DIA_WORD = /(^|[^a-záéíóúñ])d[ií]a($|[^a-záéíóúñ])/;

export function isDia(chain: string): boolean {
  return DIA_WORD.test(normalize(chain));
}

export function isCarrefour(chain: string): boolean {
  return normalize(chain).includes('carrefour');
}

export function isChangomas(chain: string): boolean {
  const n = normalize(chain);
  return n.includes('changomas') || n.includes('chango mas');
}

export function isDisco(chain: string): boolean {
  return normalize(chain).includes('disco');
}

export function isJumbo(chain: string): boolean {
  return normalize(chain).includes('jumbo');
}

export function isCoto(chain: string): boolean {
  return normalize(chain).includes('coto');
}

export function isFarmacity(chain: string): boolean {
  return normalize(chain).includes('farmacity');
}

// Cadenas nacionales grandes (para priorizarlas en la comparación).
export function isMajorChain(chain: string): boolean {
  return isCarrefour(chain) || isCoto(chain) || isJumbo(chain) || isDisco(chain) || isDia(chain) || isChangomas(chain);
}
