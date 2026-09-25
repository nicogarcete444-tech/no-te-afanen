import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatAge, isStale, oldestPricedAt, PRICE_MAX_AGE_MS } from '../lib/cartPrices';
import { fmt } from '../lib/format';
import type { Product } from '../lib/types';

const NOW = new Date('2026-09-25T12:00:00Z').getTime();

afterEach(() => vi.useRealTimers());

function product(id: string, pricedAt?: number): Product {
  return { id, name: id, pricedAt } as unknown as Product;
}

describe('isStale', () => {
  it('sin fecha siempre es viejo', () => {
    expect(isStale(product('a'))).toBe(true);
  });
  it('recién consultado no es viejo', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(isStale(product('a', NOW - 60_000))).toBe(false);
  });
  it('pasadas las 6 horas es viejo', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(isStale(product('a', NOW - PRICE_MAX_AGE_MS - 1))).toBe(true);
  });
});

describe('oldestPricedAt', () => {
  it('devuelve el precio más viejo de los items con cantidad > 0', () => {
    const products = {
      a: product('a', 1000),
      b: product('b', 500),
      c: product('c', 100),
    };
    expect(oldestPricedAt({ a: 1, b: 2, c: 0 }, products)).toBe(500);
  });
  it('carrito vacío devuelve null', () => {
    expect(oldestPricedAt({}, {})).toBeNull();
  });
  it('si ningún producto tiene fecha devuelve null', () => {
    expect(oldestPricedAt({ a: 1 }, { a: product('a') })).toBeNull();
  });
});

describe('formatAge', () => {
  it('menos de 2 minutos es "recién"', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatAge(NOW - 30_000)).toBe('recién');
  });
  it('minutos, horas, ayer y días', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatAge(NOW - 5 * 60_000)).toBe('hace 5 min');
    expect(formatAge(NOW - 3 * 3_600_000)).toBe('hace 3 h');
    expect(formatAge(NOW - 25 * 3_600_000)).toBe('ayer');
    expect(formatAge(NOW - 4 * 86_400_000)).toBe('hace 4 días');
  });
});

describe('fmt', () => {
  it('formatea en pesos redondeando', () => {
    expect(fmt(1234.6)).toMatch(/^\$1\.?235$/);
  });
});
