import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const createManagerMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createManager: (input: unknown) => createManagerMock(input),
}));

import { POST } from '@/app/api/admin/managers/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/managers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/managers', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    createManagerMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await POST(
      jsonRequest({ organizationId: 'org_1', phoneNumber: '010-1234-5678', position: '원장' }),
    );
    expect(response.status).toBe(403);
    expect(createManagerMock).not.toHaveBeenCalled();
  });

  it('creates a manager for admins', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    createManagerMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
    });

    const response = await POST(
      jsonRequest({ organizationId: 'org_1', phoneNumber: '010-1234-5678', position: '원장' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createManagerMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
    });
    expect(data.manager).toEqual({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
    });
  });

  it('rejects malformed bodies', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    const response = await POST(jsonRequest({ organizationId: 'org_1' }));
    expect(response.status).toBe(400);
    expect(createManagerMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the phone number is already registered', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    createManagerMock.mockRejectedValue(uniqueViolation);

    const response = await POST(
      jsonRequest({ organizationId: 'org_1', phoneNumber: '010-1234-5678', position: '원장' }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({ error: '이미 등록된 전화번호입니다.' });
  });

  it('propagates unexpected errors', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    createManagerMock.mockRejectedValue(new Error('connection refused'));

    await expect(
      POST(jsonRequest({ organizationId: 'org_1', phoneNumber: '010-1234-5678', position: '원장' })),
    ).rejects.toThrow('connection refused');
  });
});
