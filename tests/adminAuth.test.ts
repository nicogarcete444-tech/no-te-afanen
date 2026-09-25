import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAdminEmail, isAdminUser } from '@/lib/adminAuth';

describe('admin', () => {
  const prev = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com, otro@example.com';
  });
  afterEach(() => {
    process.env.ADMIN_EMAILS = prev;
  });

  it('isAdminEmail ignora mayúsculas y espacios', () => {
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail(' OTRO@example.com ')).toBe(true);
    expect(isAdminEmail('x@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
  it('isAdminUser exige email confirmado', () => {
    expect(isAdminUser({ email: 'admin@example.com', email_confirmed_at: null })).toBe(false);
    expect(isAdminUser({ email: 'admin@example.com' })).toBe(false);
    expect(isAdminUser({ email: 'admin@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe(true);
    expect(isAdminUser({ email: 'x@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});
