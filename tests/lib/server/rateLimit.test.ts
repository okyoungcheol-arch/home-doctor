import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit, getClientIp, MAX_TRACKED_KEYS } from '@/lib/server/rateLimit';

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

  it('bounds unbounded memory growth by clearing all tracked keys once MAX_TRACKED_KEYS is reached', () => {
    // An exhausted key stays blocked as long as its own bucket survives...
    const exhaustedKey = `test-exhaust-${Math.random()}`;
    expect(checkRateLimit(exhaustedKey, 1, 60_000)).toBe(true);
    expect(checkRateLimit(exhaustedKey, 1, 60_000)).toBe(false);

    // ...but flooding the map with enough distinct keys (simulating many distinct/spoofed
    // caller IPs that each call once and never come back) forces a full reset, which is
    // observable as the exhausted key becoming allowed again despite its window not elapsing.
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      checkRateLimit(`test-flood-${i}-${Math.random()}`, 1, 60_000);
    }

    expect(checkRateLimit(exhaustedKey, 1, 60_000)).toBe(true);
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
