import { describe, it, expect, vi } from 'vitest';
import { parseJsonBody, guard } from '@/lib/server/http';

describe('parseJsonBody', () => {
  it('returns the parsed data on valid JSON', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });
    const result = await parseJsonBody(request);
    expect(result).toEqual({ ok: true, data: { foo: 'bar' } });
  });

  it('returns a 400 response on malformed JSON', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const result = await parseJsonBody(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.response.status).toBe(400);
    const data = await result.response.json();
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
  });
});

describe('guard', () => {
  it('returns the resolved value when the guard function succeeds', async () => {
    const fn = vi.fn(async () => ({ role: 'admin' as const }));
    const result = await guard(fn, 'admin 권한이 필요합니다.', 403);
    expect(result).toEqual({ ok: true, value: { role: 'admin' } });
  });

  it('returns a response with the given message/status when the guard function throws', async () => {
    const fn = vi.fn(async () => {
      throw new Error('nope');
    });
    const result = await guard(fn, '매니저 권한이 필요합니다.', 403);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.response.status).toBe(403);
    const data = await result.response.json();
    expect(data).toEqual({ error: '매니저 권한이 필요합니다.' });
  });

  it('uses the given status code (e.g. 401) rather than always 403', async () => {
    const fn = vi.fn(async () => {
      throw new Error('nope');
    });
    const result = await guard(fn, '저장 권한이 없습니다.', 401);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.response.status).toBe(401);
  });
});
