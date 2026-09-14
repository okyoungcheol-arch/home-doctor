import { describe, it, expect, vi, beforeEach } from 'vitest';

const readSessionMock = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  readSession: () => readSessionMock(),
}));

import { getViewer, requireAdmin, requireManager, requireMember, AuthorizationError } from '@/lib/server/auth/authorize';

describe('getViewer', () => {
  beforeEach(() => {
    readSessionMock.mockReset();
  });

  it('returns guest role when there is no session', async () => {
    readSessionMock.mockResolvedValue(null);
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', organizationId: null });
  });

  it('returns admin role for an admin session', async () => {
    readSessionMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1' });
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'admin', organizationId: null, adminId: 'admin_1' });
  });

  it('returns manager role with no active member when the session has none', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    expect('activeMemberId' in viewer).toBe(false);
  });

  it('returns manager role with activeMemberId when the session has one selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
  });
});

describe('requireAdmin', () => {
  it('throws AuthorizationError when viewer is not admin', async () => {
    readSessionMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is admin', async () => {
    readSessionMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1' });
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin', adminId: 'admin_1' });
  });
});

describe('requireManager', () => {
  it('throws AuthorizationError for guests', async () => {
    readSessionMock.mockResolvedValue(null);
    await expect(requireManager()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is a manager with an organization', async () => {
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
    readSessionMock.mockResolvedValue(null);
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for a manager with no active member selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('resolves for a manager with an active member selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    await expect(requireMember()).resolves.toMatchObject({ role: 'manager', activeMemberId: 'member_1' });
  });
});
