import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const clearActiveMemberMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/auth/session', () => ({
  clearActiveMember: () => clearActiveMemberMock(),
}));

import { POST } from '@/app/api/dashboard/clear-member/route';

describe('POST /api/dashboard/clear-member', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    clearActiveMemberMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await POST();
    expect(response.status).toBe(403);
    expect(clearActiveMemberMock).not.toHaveBeenCalled();
  });

  it('clears the active member for a manager', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(clearActiveMemberMock).toHaveBeenCalledTimes(1);
  });
});
