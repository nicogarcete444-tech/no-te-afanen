import { describe, it, expect } from 'vitest';
import {
  getClientIp,
  isRateLimited,
  isValidProductId,
  isValidSucursalesArray,
  parseLat,
  parseLimit,
  parseLng,
  sanitizeQuery,
} from '../lib/apiSecurity';

describe('parseLat / parseLng', () => {
  it('acepta coordenadas válidas', () => {
    expect(parseLat('-34.6')).toBe(-34.6);
    expect(parseLng('-58.4')).toBe(-58.4);
  });
  it('rechaza fuera de rango, vacío y no numérico', () => {
    expect(parseLat('91')).toBeNull();
    expect(parseLng('181')).toBeNull();
    expect(parseLat(null)).toBeNull();
    expect(parseLng('abc')).toBeNull();
  });
});

describe('parseLimit', () => {
  it('usa el valor si es entero positivo dentro del máximo', () => {
    expect(parseLimit('10', 5, 50)).toBe(10);
  });
  it('cae al fallback si es inválido o excede el máximo', () => {
    expect(parseLimit('0', 5, 50)).toBe(5);
    expect(parseLimit('-3', 5, 50)).toBe(5);
    expect(parseLimit('1.5', 5, 50)).toBe(5);
    expect(parseLimit('51', 5, 50)).toBe(5);
    expect(parseLimit(null, 5, 50)).toBe(5);
  });
});

describe('sanitizeQuery', () => {
  it('recorta espacios y caracteres de control', () => {
    expect(sanitizeQuery('  leche\u0000 ')).toBe('leche');
  });
  it('respeta el largo máximo', () => {
    expect(sanitizeQuery('a'.repeat(200), 10)).toBe('a'.repeat(10));
  });
  it('devuelve null si queda vacío', () => {
    expect(sanitizeQuery('   ')).toBeNull();
    expect(sanitizeQuery(null)).toBeNull();
  });
});

describe('isValidProductId', () => {
  it('acepta EAN de 4 a 20 dígitos', () => {
    expect(isValidProductId('7790895000000')).toBe(true);
  });
  it('rechaza letras, muy corto o muy largo', () => {
    expect(isValidProductId('12a4')).toBe(false);
    expect(isValidProductId('123')).toBe(false);
    expect(isValidProductId('1'.repeat(21))).toBe(false);
    expect(isValidProductId(null)).toBe(false);
  });
});

describe('isValidSucursalesArray', () => {
  it('acepta ids compuestos separados por coma', () => {
    expect(isValidSucursalesArray('15-1-454,20-3-102')).toBe(true);
  });
  it('rechaza formato roto, vacío o demasiado largo', () => {
    expect(isValidSucursalesArray('15-1')).toBe(false);
    expect(isValidSucursalesArray('15-1-454;20-3-102')).toBe(false);
    expect(isValidSucursalesArray(null)).toBe(false);
    expect(isValidSucursalesArray('1-1-1,'.repeat(500))).toBe(false);
  });
});

describe('getClientIp', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
  it('usa x-real-ip si no hay x-forwarded-for', () => {
    const req = new Request('http://x', { headers: { 'x-real-ip': '5.6.7.8' } });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });
  it('devuelve unknown sin headers', () => {
    expect(getClientIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('isRateLimited (memoria local, sin env de Upstash)', () => {
  it('permite hasta el máximo y corta al pasarlo', async () => {
    const key = 'test:' + Math.random();
    for (let i = 0; i < 3; i++) {
      expect(await isRateLimited(key, 3)).toBe(false);
    }
    expect(await isRateLimited(key, 3)).toBe(true);
  });
  it('cuenta keys por separado', async () => {
    const a = 'test-a:' + Math.random();
    const b = 'test-b:' + Math.random();
    for (let i = 0; i < 2; i++) await isRateLimited(a, 2);
    expect(await isRateLimited(a, 2)).toBe(true);
    expect(await isRateLimited(b, 2)).toBe(false);
  });
});

// Regresión: el cliente puede falsear el primer valor de x-forwarded-for.
import { getClientIp as _getClientIp } from '@/lib/apiSecurity';
import { describe as _describe, it as _it, expect as _expect } from 'vitest';
_describe('getClientIp', () => {
  _it('usa el último valor de x-forwarded-for, no el primero', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
    });
    _expect(_getClientIp(req)).toBe('2.2.2.2');
  });
});
