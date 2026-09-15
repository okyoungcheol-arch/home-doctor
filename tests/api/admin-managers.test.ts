import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const createManagerMock = vi.fn();
const listManagersForOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createManager: (input: unknown) => createManagerMock(input),
  listManagersForOrganization: (organizationId: string) => listManagersForOrganizationMock(organizationId),
}));

import { POST, GET } from '@/app/api/admin/managers/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/admin/managers', body);
}

function getRequest(organizationId?: string) {
  const url = organizationId
    ? `http://localhost/api/admin/managers?organizationId=${organizationId}`
    : 'http://localhost/api/admin/managers';
  return new Request(url);
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

describe('GET /api/admin/managers', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    listManagersForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await GET(getRequest('org_1'));
    expect(response.status).toBe(403);
    expect(listManagersForOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns 400 when organizationId is missing', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    const response = await GET(getRequest());
    expect(response.status).toBe(400);
    expect(listManagersForOrganizationMock).not.toHaveBeenCalled();
  });

  it('lists managers for the given organization', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    listManagersForOrganizationMock.mockResolvedValue([
      { id: 'manager_1', organizationId: 'org_1', phoneNumber: '01012345678', position: '원장' },
    ]);

    const response = await GET(getRequest('org_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.managers).toEqual([
      { id: 'manager_1', organizationId: 'org_1', phoneNumber: '01012345678', position: '원장' },
    ]);
    expect(listManagersForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
