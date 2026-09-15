import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const findManagerByIdMock = vi.fn();
const findMemberByPhoneInOrganizationMock = vi.fn();
const listRecordsForMemberMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findManagerById: (id: string) => findManagerByIdMock(id),
  findMemberByPhoneInOrganization: (phoneNumber: string, organizationId: string) =>
    findMemberByPhoneInOrganizationMock(phoneNumber, organizationId),
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForMember: (memberId: string) => listRecordsForMemberMock(memberId),
}));

import { GET } from '@/app/api/admin/managers/notable-finding/route';

function requestFor(managerId?: string) {
  const url = managerId
    ? `http://localhost/api/admin/managers/notable-finding?managerId=${managerId}`
    : 'http://localhost/api/admin/managers/notable-finding';
  return new Request(url);
}

describe('GET /api/admin/managers/notable-finding', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    findManagerByIdMock.mockReset();
    findMemberByPhoneInOrganizationMock.mockReset();
    listRecordsForMemberMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await GET(requestFor('manager_1'));
    expect(response.status).toBe(403);
    expect(findManagerByIdMock).not.toHaveBeenCalled();
  });

  it('returns 400 when managerId is missing', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    const response = await GET(requestFor());
    expect(response.status).toBe(400);
    expect(findManagerByIdMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the manager does not exist', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findManagerByIdMock.mockResolvedValue(null);

    const response = await GET(requestFor('manager_1'));

    expect(response.status).toBe(404);
    expect(findMemberByPhoneInOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns isMember: false when the manager is not also a registered member', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findManagerByIdMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '01012345678',
      position: '원장',
    });
    findMemberByPhoneInOrganizationMock.mockResolvedValue(null);

    const response = await GET(requestFor('manager_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ isMember: false, notableFindings: null, recordDate: null });
    expect(findMemberByPhoneInOrganizationMock).toHaveBeenCalledWith('01012345678', 'org_1');
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it('returns the matched member notable findings when the phone number matches', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findManagerByIdMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '01012345678',
      position: '원장',
    });
    findMemberByPhoneInOrganizationMock.mockResolvedValue({ id: 'member_1', organizationId: 'org_1' });
    listRecordsForMemberMock.mockResolvedValue([
      { id: 'rec_1', notableFindings: '특이사항', recordDate: '2026-09-14T00:00:00.000Z' },
    ]);

    const response = await GET(requestFor('manager_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ isMember: true, notableFindings: '특이사항', recordDate: '2026-09-14T00:00:00.000Z' });
    expect(listRecordsForMemberMock).toHaveBeenCalledWith('member_1');
  });
});
