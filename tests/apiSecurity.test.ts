import { describe, expect, it } from 'vitest';
import {
  isValidProductId,
  isValidSucursalesArray,
  parseLat,
  parseLimit,
  parseLng,
  sanitizeQuery,
} from '@/lib/apiSecurity';

describe('validadores', () => {
  it('parseLat/parseLng redondean a 2 decimales y validan rango', () => {
    expect(parseLat('-34.60371234')).toBe(-34.6);
    expect(parseLng('-58.38159')).toBe(-58.38);
    expect(parseLat('91')).toBeNull();
    expect(parseLng('-181')).toBeNull();
    expect(parseLat('abc')).toBeNull();
    expect(parseLat(null)).toBeNull();
  });
  it('parseLimit respeta máximo y fallback', () => {
    expect(parseLimit('10', 5, 50)).toBe(10);
    expect(parseLimit('999', 5, 50)).toBe(5);
    expect(parseLimit('1.5', 5, 50)).toBe(5);
    expect(parseLimit(null, 5, 50)).toBe(5);
  });
  it('sanitizeQuery corta y saca caracteres de control', () => {
    expect(sanitizeQuery('  leche\u0000 entera ')).toBe('leche entera');
    expect(sanitizeQuery('a'.repeat(200), 10)).toHaveLength(10);
    expect(sanitizeQuery('   ')).toBeNull();
  });
  it('isValidProductId solo acepta dígitos (4–20)', () => {
    expect(isValidProductId('7790070410108')).toBe(true);
    expect(isValidProductId('12')).toBe(false);
    expect(isValidProductId('779x0070')).toBe(false);
    expect(isValidProductId(null)).toBe(false);
  });
  it('isValidSucursalesArray valida cada id compuesto', () => {
    expect(isValidSucursalesArray('15-1-454,20-3-102')).toBe(true);
    expect(isValidSucursalesArray('15-1-454,x')).toBe(false);
    expect(isValidSucursalesArray('')).toBe(false);
  });
});
