import { describe, it, expect, vi, beforeEach } from 'vitest';

const readSessionMock = vi.fn();
const findMemberByIdMock = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  readSession: () => readSessionMock(),
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberById: (id: string) => findMemberByIdMock(id),
}));

import { getPatientProfile } from '@/lib/server/auth/patientProfile';

describe('getPatientProfile', () => {
  beforeEach(() => {
    readSessionMock.mockReset();
    findMemberByIdMock.mockReset();
  });

  it('returns null for a guest (no session)', async () => {
    readSessionMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberByIdMock).not.toHaveBeenCalled();
  });

  it('returns null for a manager session with no activeMemberId', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberByIdMock).not.toHaveBeenCalled();
  });

  it('returns null when activeMemberId points to a stale/missing member', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_missing',
    });
    findMemberByIdMock.mockResolvedValue(null);
    expect(await getPatientProfile()).toBeNull();
    expect(findMemberByIdMock).toHaveBeenCalledWith('member_missing');
  });

  it('reads ageBand/gender/occupation from the active member row', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    findMemberByIdMock.mockResolvedValue({
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
    findMemberByIdMock.mockResolvedValue({
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
