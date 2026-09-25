import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRateLimited } from '@/lib/apiSecurity';

const req = () => new Request('http://localhost/api/x');

describe('isRateLimited', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('cuenta por costo, no por request', async () => {
    const scope = `t-cost-${Math.random()}`;
    expect(await isRateLimited(req(), scope, 10, { cost: 6, failMode: 'open' })).toBe(false);
    expect(await isRateLimited(req(), scope, 10, { cost: 6, failMode: 'open' })).toBe(true);
  });

  it('en producción sin backend compartido: escrituras cierran, lecturas abren', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(await isRateLimited(req(), `t-w-${Math.random()}`, 10, { failMode: 'closed' })).toBe(true);
    expect(await isRateLimited(req(), `t-r-${Math.random()}`, 10, { failMode: 'open' })).toBe(false);
  });
});
