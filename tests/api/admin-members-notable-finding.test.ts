import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const findMemberByIdMock = vi.fn();
const listRecordsForMemberMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberById: (id: string) => findMemberByIdMock(id),
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForMember: (memberId: string) => listRecordsForMemberMock(memberId),
}));

import { GET } from '@/app/api/admin/members/notable-finding/route';

function requestFor(memberId?: string) {
  const url = memberId
    ? `http://localhost/api/admin/members/notable-finding?memberId=${memberId}`
    : 'http://localhost/api/admin/members/notable-finding';
  return new Request(url);
}

describe('GET /api/admin/members/notable-finding', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    findMemberByIdMock.mockReset();
    listRecordsForMemberMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await GET(requestFor('member_1'));
    expect(response.status).toBe(403);
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it('returns 400 when memberId is missing', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    const response = await GET(requestFor());
    expect(response.status).toBe(400);
    expect(findMemberByIdMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the member does not exist', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findMemberByIdMock.mockResolvedValue(null);

    const response = await GET(requestFor('member_1'));

    expect(response.status).toBe(404);
    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
  });

  it('returns the most recent record notable findings', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findMemberByIdMock.mockResolvedValue({ id: 'member_1', name: '홍길동' });
    listRecordsForMemberMock.mockResolvedValue([
      { id: 'rec_2', notableFindings: '최근 특이사항', recordDate: '2026-09-14T00:00:00.000Z' },
      { id: 'rec_1', notableFindings: '이전 특이사항', recordDate: '2026-09-01T00:00:00.000Z' },
    ]);

    const response = await GET(requestFor('member_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ notableFindings: '최근 특이사항', recordDate: '2026-09-14T00:00:00.000Z' });
  });

  it('returns null when the member has no records', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', organizationId: null });
    findMemberByIdMock.mockResolvedValue({ id: 'member_1', name: '홍길동' });
    listRecordsForMemberMock.mockResolvedValue([]);

    const response = await GET(requestFor('member_1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ notableFindings: null, recordDate: null });
  });
});
