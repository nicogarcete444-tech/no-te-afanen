// Arma el link de compra real de cada súper para un producto puntual, así
// el usuario puede ir directo a comprarlo ahí en vez de solo comparar el
// precio acá. Los patrones de búsqueda de Carrefour, Coto y Disco están
// confirmados a mano contra sus sitios reales; Jumbo comparte la misma
// plataforma (VTEX) que Disco, así que se arma igual. Para Día y ChangoMas
// no pudimos confirmar un patrón de búsqueda estable, así que en vez de
// arriesgarnos a un link de resultados roto, mandamos a la home del súper.
import { isCarrefour, isChangomas, isCoto, isDia, isDisco, isFarmacity, isJumbo } from './chains';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

export function getStoreBuyUrl(chain: string, productName: string): string | null {
  const q = encodeURIComponent(productName);
  const slug = slugify(productName) || 'busqueda';

  if (isCarrefour(chain)) {
    return `https://supermercado.carrefour.com.ar/catalogsearch/result/?q=${q}`;
  }
  if (isCoto(chain)) {
    return `https://www.cotodigital.com.ar/sitios/cdigi/productos/${slug}`;
  }
  if (isDisco(chain)) {
    return `https://www.disco.com.ar/${slug}?_q=${q}&map=ft`;
  }
  if (isJumbo(chain)) {
    return `https://www.jumbo.com.ar/${slug}?_q=${q}&map=ft`;
  }
  if (isChangomas(chain)) {
    return 'https://www.masonline.com.ar/';
  }
  if (isDia(chain)) {
    return 'https://diaonline.supermercadosdia.com.ar/';
  }
  if (isFarmacity(chain)) {
    return 'https://www.farmacity.com/';
  }
  return null;
}
