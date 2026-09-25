import { describe, it, expect } from 'vitest';
import { cartSignature, getWeekStart, FREE_COMPARE_LIMIT } from '../lib/compareLimit';

describe('FREE_COMPARE_LIMIT', () => {
  it('el plan free tiene 3 comparaciones por semana', () => {
    expect(FREE_COMPARE_LIMIT).toBe(3);
  });
});

describe('getWeekStart', () => {
  it('un miércoles devuelve el lunes de esa semana', () => {
    // 2026-09-23 es miércoles
    expect(getWeekStart(new Date(2026, 8, 23, 12, 0))).toBe('2026-09-21');
  });
  it('un domingo devuelve el lunes anterior (no el siguiente)', () => {
    // 2026-09-27 es domingo
    expect(getWeekStart(new Date(2026, 8, 27, 12, 0))).toBe('2026-09-21');
  });
  it('un lunes devuelve el mismo día', () => {
    expect(getWeekStart(new Date(2026, 8, 21, 0, 0))).toBe('2026-09-21');
  });
});

describe('cartSignature', () => {
  it('es igual sin importar el orden de los items', () => {
    expect(cartSignature({ a: 1, b: 2 })).toBe(cartSignature({ b: 2, a: 1 }));
  });
  it('cambia si cambia la cantidad', () => {
    expect(cartSignature({ a: 1 })).not.toBe(cartSignature({ a: 2 }));
  });
  it('ignora items con cantidad 0 o negativa', () => {
    expect(cartSignature({ a: 1, b: 0, c: -1 })).toBe(cartSignature({ a: 1 }));
  });
  it('carrito vacío devuelve string vacío', () => {
    expect(cartSignature({})).toBe('');
  });
});
