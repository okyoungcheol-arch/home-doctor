import { describe, it, expect, vi, beforeEach } from 'vitest';

const readSessionMock = vi.fn();
const findMemberInOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  readSession: () => readSessionMock(),
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberInOrganization: (id: string, organizationId: string) =>
    findMemberInOrganizationMock(id, organizationId),
}));

import { getPatientProfile } from '@/lib/server/auth/patientProfile';

describe('getPatientProfile', () => {
  beforeEach(() => {
    readSessionMock.mockReset();
    findMemberInOrganizationMock.mockReset();
  });

  it('returns null for a guest (no session)', async () => {
    readSessionMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberInOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns null for an admin session', async () => {
    readSessionMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1' });
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberInOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns null for a manager session with no activeMemberId', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberInOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns null when activeMemberId points to a stale/missing member', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_missing',
    });
    findMemberInOrganizationMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberInOrganizationMock).toHaveBeenCalledWith('member_missing', 'org_1');
  });

  it('returns null when the member row belongs to a different organization than the session', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    // findMemberInOrganization itself scopes the query to organizationId at the DB level, so a
    // cross-organization member simply comes back as null — same as a missing member.
    findMemberInOrganizationMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberInOrganizationMock).toHaveBeenCalledWith('member_1', 'org_1');
  });

  it('reads ageBand/gender/occupation from the active member row', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    findMemberInOrganizationMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      ageBand: '60~64세',
      gender: 'male',
      occupation: '농업',
      createdAt: new Date(),
    });
    expect(await getPatientProfile()).toEqual({ ageBand: '60~64세', gender: 'male', occupation: '농업' });
  });

  it('defensively blanks out a corrupted/invalid enum value on the member row', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    findMemberInOrganizationMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      ageBand: 'not-a-real-band',
      gender: 'not-a-real-gender',
      occupation: 'not-a-real-job',
      createdAt: new Date(),
    });
    expect(await getPatientProfile()).toEqual({ ageBand: '', gender: '', occupation: '' });
  });
});
