import { describe, expect, it } from 'vitest';
import { cartSignature } from '@/lib/compareLimit';

describe('cartSignature', () => {
  it('es estable sin importar el orden y descarta cantidades en 0', () => {
    expect(cartSignature({ b: 2, a: 1, c: 0 })).toBe('a:1|b:2');
    expect(cartSignature({ a: 1, b: 2 })).toBe(cartSignature({ b: 2, a: 1 }));
  });
  it('cambia si cambia una cantidad', () => {
    expect(cartSignature({ a: 1 })).not.toBe(cartSignature({ a: 2 }));
  });
});
