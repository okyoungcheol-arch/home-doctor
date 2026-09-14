import { describe, it, expect, vi, beforeEach } from 'vitest';

const findAdminByPhoneNumberMock = vi.fn();
const createAdminSessionMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/lib/server/admins/repository', () => ({
  findAdminByPhoneNumber: (phoneNumber: string) => findAdminByPhoneNumberMock(phoneNumber),
}));

vi.mock('@/lib/server/auth/session', () => ({
  createAdminSession: (adminId: string) => createAdminSessionMock(adminId),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: (key: string, limit: number, windowMs: number) =>
    checkRateLimitMock(key, limit, windowMs),
  getClientIp: () => '203.0.113.1',
}));

import { POST } from '@/app/api/admin-entry/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/admin-entry', body);
}

describe('POST /api/admin-entry', () => {
  beforeEach(() => {
    findAdminByPhoneNumberMock.mockReset();
    createAdminSessionMock.mockReset();
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
  });

  it('returns 429 and skips lookup when the rate limit is exceeded', async () => {
    checkRateLimitMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ phoneNumber: '010-1234-5678' }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data).toEqual({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).toHaveBeenCalledWith('admin-entry:203.0.113.1', expect.any(Number), expect.any(Number));
  });

  it('creates an admin session and succeeds for a registered phone number', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue({
      id: 'admin_1',
      phoneNumber: '010-1234-5678',
      name: '홍길동',
      createdAt: new Date(),
    });

    const response = await POST(jsonRequest({ phoneNumber: '010-1234-5678' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(createAdminSessionMock).toHaveBeenCalledWith('admin_1');
  });

  it('returns 404 and does not create a session for an unregistered phone number', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ phoneNumber: '010-0000-0000' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '등록되지 않은 전화번호입니다.' });
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies with 400', async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
  });
});
