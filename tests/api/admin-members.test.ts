import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const getOrganizationMembershipListMock = vi.fn();
const createOrganizationMembershipMock = vi.fn();
const updateOrganizationMembershipMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: (input: unknown) => getOrganizationMembershipListMock(input),
      createOrganizationMembership: (input: unknown) => createOrganizationMembershipMock(input),
      updateOrganizationMembership: (input: unknown) => updateOrganizationMembershipMock(input),
    },
  }),
}));

import { PATCH } from '@/app/api/admin/members/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/members', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/members', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    getOrganizationMembershipListMock.mockReset();
    createOrganizationMembershipMock.mockReset();
    updateOrganizationMembershipMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));
    expect(response.status).toBe(403);
  });

  it('creates a new membership when the user is not yet a member', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    getOrganizationMembershipListMock.mockResolvedValue({ data: [] });
    createOrganizationMembershipMock.mockResolvedValue({ role: 'org:admin' });

    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_2',
      role: 'org:admin',
    });
    expect(updateOrganizationMembershipMock).not.toHaveBeenCalled();
    expect(data.membership).toEqual({ userId: 'user_2', organizationId: 'org_1', role: 'org:admin' });
  });

  it('updates the role when the user is already a member', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    getOrganizationMembershipListMock.mockResolvedValue({
      data: [{ publicUserData: { userId: 'user_2' }, role: 'org:member' }],
    });
    updateOrganizationMembershipMock.mockResolvedValue({ role: 'org:admin' });

    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));

    expect(response.status).toBe(200);
    expect(updateOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_2',
      role: 'org:admin',
    });
    expect(createOrganizationMembershipMock).not.toHaveBeenCalled();
  });
});
