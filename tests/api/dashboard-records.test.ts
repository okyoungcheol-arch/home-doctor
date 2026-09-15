import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const findMemberInOrganizationMock = vi.fn();
const listRecordsForMemberMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberInOrganization: (id: string, organizationId: string) =>
    findMemberInOrganizationMock(id, organizationId),
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForMember: (memberId: string) => listRecordsForMemberMock(memberId),
}));

import { GET } from '@/app/api/dashboard/records/route';

function requestFor(memberId?: string) {
  const url = memberId
    ? `http://localhost/api/dashboard/records?memberId=${memberId}`
    : 'http://localhost/api/dashboard/records';
  return new Request(url);
}

describe('GET /api/dashboard/records', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    findMemberInOrganizationMock.mockReset();
    listRecordsForMemberMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await GET(requestFor('member_1'));
    expect(response.status).toBe(403);
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it('returns 400 when memberId is missing', async () => {
    requireManagerMock.mockResolvedValue({ role: 'manager', organizationId: 'org_1' });
    const response = await GET(requestFor());
    expect(response.status).toBe(400);
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the member does not belong to the caller organization', async () => {
    requireManagerMock.mockResolvedValue({ role: 'manager', organizationId: 'org_1' });
    findMemberInOrganizationMock.mockResolvedValue(null);
    const response = await GET(requestFor('member_1'));
    expect(response.status).toBe(404);
    expect(findMemberInOrganizationMock).toHaveBeenCalledWith('member_1', 'org_1');
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it("returns only the requested member's records", async () => {
    requireManagerMock.mockResolvedValue({ role: 'manager', organizationId: 'org_1' });
    findMemberInOrganizationMock.mockResolvedValue({ id: 'member_1', organizationId: 'org_1' });
    listRecordsForMemberMock.mockResolvedValue([{ id: 'rec_1', memberId: 'member_1' }]);

    const response = await GET(requestFor('member_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([{ id: 'rec_1', memberId: 'member_1' }]);
    expect(listRecordsForMemberMock).toHaveBeenCalledWith('member_1');
  });
});
