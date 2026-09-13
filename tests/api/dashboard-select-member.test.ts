import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const findMemberByIdMock = vi.fn();
const setActiveMemberMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberById: (id: string) => findMemberByIdMock(id),
}));

vi.mock('@/lib/server/auth/session', () => ({
  setActiveMember: (memberId: string) => setActiveMemberMock(memberId),
}));

import { POST } from '@/app/api/dashboard/select-member/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/dashboard/select-member', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/dashboard/select-member', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    findMemberByIdMock.mockReset();
    setActiveMemberMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await POST(jsonRequest({ memberId: 'member_1' }));
    expect(response.status).toBe(403);
    expect(findMemberByIdMock).not.toHaveBeenCalled();
    expect(setActiveMemberMock).not.toHaveBeenCalled();
  });

  it('selects a member belonging to the same organization', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    findMemberByIdMock.mockResolvedValue({ id: 'member_1', organizationId: 'org_1', name: '홍길동' });

    const response = await POST(jsonRequest({ memberId: 'member_1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(setActiveMemberMock).toHaveBeenCalledWith('member_1');
  });

  it('rejects a member belonging to a different organization', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    findMemberByIdMock.mockResolvedValue({ id: 'member_1', organizationId: 'org_2', name: '홍길동' });

    const response = await POST(jsonRequest({ memberId: 'member_1' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '해당 회원을 찾을 수 없습니다.' });
    expect(setActiveMemberMock).not.toHaveBeenCalled();
  });

  it('rejects a member id that does not exist', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    findMemberByIdMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ memberId: 'missing' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '해당 회원을 찾을 수 없습니다.' });
    expect(setActiveMemberMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(findMemberByIdMock).not.toHaveBeenCalled();
    expect(setActiveMemberMock).not.toHaveBeenCalled();
  });
});
