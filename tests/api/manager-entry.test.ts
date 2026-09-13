import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManagerByPhoneNumberMock = vi.fn();
const createManagerSessionMock = vi.fn();

vi.mock('@/lib/server/organizations/repository', () => ({
  findManagerByPhoneNumber: (phoneNumber: string) => findManagerByPhoneNumberMock(phoneNumber),
}));

vi.mock('@/lib/server/auth/session', () => ({
  createManagerSession: (managerId: string, organizationId: string) =>
    createManagerSessionMock(managerId, organizationId),
}));

import { POST } from '@/app/api/manager-entry/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/manager-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/manager-entry', () => {
  beforeEach(() => {
    findManagerByPhoneNumberMock.mockReset();
    createManagerSessionMock.mockReset();
  });

  it('creates a manager session and succeeds for a registered phone number', async () => {
    findManagerByPhoneNumberMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
      createdAt: new Date(),
    });

    const response = await POST(jsonRequest({ phoneNumber: '010-1234-5678' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(createManagerSessionMock).toHaveBeenCalledWith('manager_1', 'org_1');
  });

  it('returns 404 and does not create a session for an unregistered phone number', async () => {
    findManagerByPhoneNumberMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ phoneNumber: '010-0000-0000' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '등록되지 않은 전화번호입니다.' });
    expect(createManagerSessionMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies with 400', async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findManagerByPhoneNumberMock).not.toHaveBeenCalled();
    expect(createManagerSessionMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/manager-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findManagerByPhoneNumberMock).not.toHaveBeenCalled();
  });
});
