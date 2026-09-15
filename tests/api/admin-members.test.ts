import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const listMembersForOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  listMembersForOrganization: (organizationId: string) => listMembersForOrganizationMock(organizationId),
}));

import { GET } from '@/app/api/admin/members/route';

function requestFor(organizationId?: string) {
  const url = organizationId
    ? `http://localhost/api/admin/members?organizationId=${organizationId}`
    : 'http://localhost/api/admin/members';
  return new Request(url);
}

describe('GET /api/admin/members', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    listMembersForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await GET(requestFor('org_1'));
    expect(response.status).toBe(403);
    expect(listMembersForOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns 400 when organizationId is missing', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    const response = await GET(requestFor());
    expect(response.status).toBe(400);
    expect(listMembersForOrganizationMock).not.toHaveBeenCalled();
  });

  it('lists members for the given organization', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    listMembersForOrganizationMock.mockResolvedValue([{ id: 'member_1', name: '홍길동' }]);

    const response = await GET(requestFor('org_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toEqual([{ id: 'member_1', name: '홍길동' }]);
    expect(listMembersForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
