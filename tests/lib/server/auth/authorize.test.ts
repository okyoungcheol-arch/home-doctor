import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const getUserMock = vi.fn();
const readSessionMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: getUserMock } }),
}));

vi.mock('@/lib/server/auth/session', () => ({
  readSession: () => readSessionMock(),
}));

import { getViewer, requireAdmin, requireManager, requireMember, AuthorizationError } from '@/lib/server/auth/authorize';

describe('getViewer', () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserMock.mockReset();
    readSessionMock.mockReset();
  });

  it('returns guest role when there is no Clerk admin and no manager session', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue(null);
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', userId: null, organizationId: null });
  });

  it('returns admin role when publicMetadata.role is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1' });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'admin', userId: 'user_1', organizationId: null });
    expect(readSessionMock).not.toHaveBeenCalled();
  });

  it('returns manager role with no active member when the session has none', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    expect(viewer.activeMemberId).toBeUndefined();
    expect('activeMemberId' in viewer).toBe(false);
  });

  it('returns manager role with activeMemberId when the session has one selected', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
  });

  it('falls through to session/guest for a signed-in Clerk user who is not flagged admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_2' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    readSessionMock.mockResolvedValue(null);
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', userId: null, organizationId: null });
  });
});

describe('requireAdmin', () => {
  it('throws AuthorizationError when viewer is not admin', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1' });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' });
  });
});

describe('requireManager', () => {
  it('throws AuthorizationError for guests', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue(null);
    await expect(requireManager()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is a manager with an organization', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    await expect(requireManager()).resolves.toMatchObject({ role: 'manager', organizationId: 'org_1' });
  });
});

describe('requireMember', () => {
  it('throws AuthorizationError for guests', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue(null);
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for a manager with no active member selected', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('resolves for a manager with an active member selected', async () => {
    authMock.mockResolvedValue({ userId: null });
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    await expect(requireMember()).resolves.toMatchObject({ role: 'manager', activeMemberId: 'member_1' });
  });
});
