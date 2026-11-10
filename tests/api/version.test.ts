import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/version/route';

describe('GET /api/version', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the Vercel deployment id and forbids caching', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_abc');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'sha_123');

    const response = GET();

    expect(await response.json()).toEqual({ version: 'dpl_abc' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falls back to the commit sha, then to a fixed local value', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'sha_123');
    expect(await GET().json()).toEqual({ version: 'sha_123' });

    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', undefined);
    expect(await GET().json()).toEqual({ version: 'local' });
  });
});
