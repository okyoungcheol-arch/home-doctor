import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';

describe('checkRateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows calls under the limit and blocks once the limit is reached within the window', () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);
  });

  it('resets the count once the window has elapsed', () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 1, 1000)).toBe(true);
    expect(checkRateLimit(key, 1, 1000)).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, 1, 1000)).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(true);
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000)).toBe(true);
  });
});

describe('getClientIp', () => {
  it('uses the first entry of x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = new Request('http://localhost', { headers: { 'x-real-ip': '203.0.113.2' } });
    expect(getClientIp(request)).toBe('203.0.113.2');
  });

  it('falls back to "unknown" when neither header is present', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('unknown');
  });
});
