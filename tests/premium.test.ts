import { describe, expect, it } from 'vitest';
import { isPremiumStatusActive, premiumExpiresAt } from '@/lib/premium';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe('isPremiumStatusActive', () => {
  it('false sin fila o con is_premium en false', () => {
    expect(isPremiumStatusActive(null)).toBe(false);
    expect(isPremiumStatusActive({ is_premium: false, since: iso(-1), premium_until: iso(10) })).toBe(false);
  });
  it('respeta premium_until', () => {
    expect(isPremiumStatusActive({ is_premium: true, since: iso(-5), premium_until: iso(5) })).toBe(true);
    expect(isPremiumStatusActive({ is_premium: true, since: iso(-40), premium_until: iso(-1) })).toBe(false);
  });
  it('sin premium_until vence a los 30 días del alta', () => {
    expect(isPremiumStatusActive({ is_premium: true, since: iso(-10), premium_until: null })).toBe(true);
    expect(isPremiumStatusActive({ is_premium: true, since: iso(-31), premium_until: null })).toBe(false);
    expect(premiumExpiresAt({ is_premium: true, since: iso(-31), premium_until: null })).toBeInstanceOf(Date);
  });
});
