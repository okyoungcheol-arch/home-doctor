import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: getUserMock } }),
}));

import { getViewer, requireAdmin, requireManager, requireMember, AuthorizationError } from '@/lib/server/auth/authorize';

describe('getViewer', () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserMock.mockReset();
  });

  it('returns guest role when there is no session', async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', userId: null, organizationId: null });
  });

  it('returns admin role when publicMetadata.role is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    const viewer = await getViewer();
    expect(viewer.role).toBe('admin');
  });

  it('returns manager role when orgRole is org:admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: 'org_1', orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    const viewer = await getViewer();
    expect(viewer.role).toBe('manager');
    expect(viewer.organizationId).toBe('org_1');
  });

  it('returns member role otherwise', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    const viewer = await getViewer();
    expect(viewer.role).toBe('member');
  });
});

describe('requireAdmin', () => {
  it('throws AuthorizationError when viewer is not admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireAdmin()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' });
  });
});

describe('requireManager', () => {
  it('throws AuthorizationError when viewer has no organization', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: null, orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireManager()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is a manager with an organization', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: 'org_1', orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireManager()).resolves.toMatchObject({ role: 'manager', organizationId: 'org_1' });
  });
});

describe('requireMember', () => {
  it('throws AuthorizationError for guests', async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('resolves for any signed-in viewer', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireMember()).resolves.toMatchObject({ role: 'member', userId: 'user_3' });
  });
});
