import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const createMemberMock = vi.fn();
const listMembersForOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createMember: (input: unknown) => createMemberMock(input),
  listMembersForOrganization: (organizationId: string) => listMembersForOrganizationMock(organizationId),
}));

import { POST, GET } from '@/app/api/dashboard/members/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/dashboard/members', body);
}

describe('POST /api/dashboard/members', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    createMemberMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
      }),
    );
    expect(response.status).toBe(403);
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('creates a member scoped to the manager organization', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    createMemberMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      createdAt: new Date(),
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createMemberMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
    });
    expect(data.member).toEqual({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      createdAt: expect.any(String),
    });
  });

  it('rejects malformed bodies', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(jsonRequest({ name: '홍길동' }));
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('rejects invalid enum values', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'not-a-gender',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
      }),
    );
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/dashboard/members', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    listMembersForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listMembersForOrganizationMock).not.toHaveBeenCalled();
  });

  it("scopes results to the manager's own organization", async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    listMembersForOrganizationMock.mockResolvedValue([{ id: 'member_1', organizationId: 'org_1', name: '홍길동' }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toEqual([{ id: 'member_1', organizationId: 'org_1', name: '홍길동' }]);
    expect(listMembersForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
