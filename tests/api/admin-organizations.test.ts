import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const createOrganizationMock = vi.fn();
const listOrganizationsMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createOrganization: (name: string) => createOrganizationMock(name),
  listOrganizations: () => listOrganizationsMock(),
}));

import { POST, GET } from '@/app/api/admin/organizations/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/organizations', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    createOrganizationMock.mockReset();
    listOrganizationsMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await POST(jsonRequest({ name: '테스트 병원' }));
    expect(response.status).toBe(403);
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it('creates an organization for admins', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    createOrganizationMock.mockResolvedValue({ id: 'org_1', name: '테스트 병원' });

    const response = await POST(jsonRequest({ name: '테스트 병원' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createOrganizationMock).toHaveBeenCalledWith('테스트 병원');
    expect(data.organization).toEqual({ id: 'org_1', name: '테스트 병원' });
  });

  it('rejects malformed bodies', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/organizations', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    createOrganizationMock.mockReset();
    listOrganizationsMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  it('lists organizations for admins', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    listOrganizationsMock.mockResolvedValue([
      { id: 'org_1', name: '테스트 병원', createdAt: new Date() },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.organizations).toEqual([
      { id: 'org_1', name: '테스트 병원', createdAt: expect.any(String) },
    ]);
  });
});
