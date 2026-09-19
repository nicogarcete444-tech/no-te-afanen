// Precio por kg/L (o por unidad), a partir del precio total del producto y
// del texto libre de "presentación" que informa Precios Claros (viene tal
// cual lo carga cada comercio: "900 GR", "1 Kg.", "1,5 LT", "Pack x6x125g",
// "12 un", y muchas variantes más, sin un formato fijo).
//
// Si el texto no se puede interpretar con confianza, se devuelve null. Es
// a propósito: mejor no mostrar nada a mostrar un precio por unidad mal
// calculado, que induce a un error de compra peor que no tener el dato.

export type UnitPriceResult = { label: string };

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function fromWeightOrVolume(precio: number, qty: number, unit: string): UnitPriceResult | null {
  if (!qty || qty <= 0 || !isFinite(qty)) return null;
  const u = unit.toUpperCase();
  let perBaseUnit: number;
  let suffix: string;
  if (u === 'KG' || u === 'KGS') {
    perBaseUnit = precio / qty;
    suffix = 'kg';
  } else if (u === 'GR' || u === 'GRS' || u === 'G') {
    perBaseUnit = precio / (qty / 1000);
    suffix = 'kg';
  } else if (u === 'LT' || u === 'LTS' || u === 'L') {
    perBaseUnit = precio / qty;
    suffix = 'L';
  } else if (u === 'ML' || u === 'CC') {
    perBaseUnit = precio / (qty / 1000);
    suffix = 'L';
  } else {
    return null;
  }
  if (!isFinite(perBaseUnit) || perBaseUnit <= 0) return null;
  return { label: `${fmtMoney(perBaseUnit)} el ${suffix}` };
}

const UNIT_RE = 'KG|KGS|GR|GRS|G|ML|CC|LT|LTS|L';

export function computeUnitPrice(precio: number | null | undefined, presentacion?: string | null): UnitPriceResult | null {
  if (!precio || precio <= 0 || !presentacion) return null;
  const text = presentacion.toUpperCase();

  // Pack multi-unidad, en cualquiera de los dos órdenes en que suele venir
  // cargado: "6X125GR" / "PACK X6 X125G" o "125GR X6" / "125 G X 6 UN".
  // El total del producto (lo que realmente cuesta `precio`) es packs*tamaño.
  const packA = text.match(new RegExp(`(\\d+)\\s*X\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b`));
  if (packA) {
    const packs = parseInt(packA[1], 10);
    const size = toNumber(packA[2]);
    if (packs > 1) return fromWeightOrVolume(precio, packs * size, packA[3]);
  }
  const packB = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\s*X\\s*(\\d+)\\b`));
  if (packB) {
    const size = toNumber(packB[1]);
    const packs = parseInt(packB[3], 10);
    if (packs > 1) return fromWeightOrVolume(precio, packs * size, packB[2]);
  }

  // Peso o volumen simple: "900 GR", "1 KG", "1,5 LT", "500ML".
  const simple = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b`));
  if (simple) return fromWeightOrVolume(precio, toNumber(simple[1]), simple[2]);

  // Cantidad de unidades sueltas: "X12", "12 UN", "12 UNID", "DOCENA".
  const units = text.match(/(?:X\s*)?(\d+)\s*(?:UN|UNID|U)\b/);
  if (units) {
    const n = parseInt(units[1], 10);
    if (n > 1) return { label: `${fmtMoney(precio / n)} c/u` };
  }
  if (/DOCENA/.test(text)) return { label: `${fmtMoney(precio / 12)} c/u` };

  return null;
}
