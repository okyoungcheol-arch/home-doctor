import { describe, it, expect, vi, beforeEach } from 'vitest';

// True end-to-end coverage for the manager/member save path, addressing the FINAL
// WHOLE-BRANCH REVIEW's recommendation: manager-entry -> signed cookie -> getViewer ->
// requireMember -> createRecord, with only the DB/repository layer mocked. Every other
// per-route test in this suite mocks '@/lib/server/auth/authorize' and/or
// '@/lib/server/auth/session' wholesale, so no single test previously verified that a real
// signed cookie issued by /api/manager-entry actually carries through readSession/getViewer
// to authorize a later /api/records save — exactly the kind of cross-layer gap that let the
// CRITICAL clearActiveMember-not-wired finding survive 18 individual task reviews.
//
// '@clerk/nextjs/server' and 'next/headers' are mocked (no real Clerk/Next.js server runtime
// is available in this test environment); 'next/headers'' cookies() returns one shared
// in-memory store for the whole test, simulating a browser holding the session cookie across
// the three requests below. lib/server/auth/session.ts and lib/server/auth/authorize.ts run
// for real.

const authMock = vi.fn();
const findManagerByPhoneNumberMock = vi.fn();
const findMemberInOrganizationMock = vi.fn();
const createRecordMock = vi.fn();

const cookieState = new Map<string, { value: string }>();
const cookieStore = {
  get: (name: string) => cookieState.get(name),
  set: (name: string, value: string) => {
    cookieState.set(name, { value });
  },
  delete: (name: string) => {
    cookieState.delete(name);
  },
};

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: vi.fn() } }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findManagerByPhoneNumber: (phoneNumber: string) => findManagerByPhoneNumberMock(phoneNumber),
  findMemberInOrganization: (id: string, organizationId: string) =>
    findMemberInOrganizationMock(id, organizationId),
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
}));

import { POST as managerEntryPost } from '@/app/api/manager-entry/route';
import { POST as selectMemberPost } from '@/app/api/dashboard/select-member/route';
import { POST as recordsPost } from '@/app/api/records/route';
import { getViewer } from '@/lib/server/auth/authorize';
import { jsonRequest } from '@/tests/helpers/request';

describe('manager-entry -> select-member -> records save (real session/cookie, DB-mocked)', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-only-for-vitest-do-not-use-elsewhere';
    cookieState.clear();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: null }); // no Clerk session anywhere in this flow
    findManagerByPhoneNumberMock.mockReset();
    findMemberInOrganizationMock.mockReset();
    createRecordMock.mockReset();
  });

  it('carries a real signed cookie through the full manager save flow', async () => {
    // ---- 1) manager-entry: registered phone number issues a real signed session cookie ----
    findManagerByPhoneNumberMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
      createdAt: new Date(),
    });

    const entryResponse = await managerEntryPost(
      jsonRequest('http://localhost/api/manager-entry', { phoneNumber: '010-1234-5678' }),
    );
    expect(entryResponse.status).toBe(200);
    expect(cookieState.has('hd_session')).toBe(true);

    // getViewer() now reads the real cookie just set above.
    expect(await getViewer()).toEqual({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    // ---- 2) select-member: manager picks a member belonging to their own organization ----
    findMemberInOrganizationMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-9999-8888',
      ageBand: '60~64세',
      gender: 'male',
      occupation: '농업',
      createdAt: new Date(),
    });

    const selectResponse = await selectMemberPost(
      jsonRequest('http://localhost/api/dashboard/select-member', { memberId: 'member_1' }),
    );
    expect(selectResponse.status).toBe(200);

    // getViewer() now reflects the updated cookie with activeMemberId set.
    expect(await getViewer()).toEqual({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });

    // ---- 3) records: requireMember() reads the same real cookie and authorizes the save ----
    findMemberInOrganizationMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-9999-8888',
    });
    createRecordMock.mockResolvedValue({ id: 'record_1' });

    const saveResponse = await recordsPost(
      jsonRequest('http://localhost/api/records', {
        documentTexts: [],
        recordingText: '전사문',
        interviewRecord: { qaLog: [] },
        diagnosisResult: '천식 의심',
        precautions: '호흡기내과 방문 권장',
        notableFindings: null,
        isCritical: false,
      }),
    );
    expect(saveResponse.status).toBe(200);
    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'member_1',
        organizationId: 'org_1',
        memberName: '홍길동',
        memberPhoneNumber: '010-9999-8888',
        diagnosisResult: '천식 의심',
      }),
    );

    // ---- 4) the save route itself cleared activeMemberId from the real cookie — verified by
    // reading it back through the real getViewer()/readSession() stack, not a mock assertion.
    // This is exactly the wiring whose absence was the FINAL WHOLE-BRANCH REVIEW's CRITICAL
    // finding (a stale activeMemberId sticking around for the next patient on a shared tablet).
    expect(await getViewer()).toEqual({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
  });

  it('refuses the save when no member has been selected in the session', async () => {
    findManagerByPhoneNumberMock.mockResolvedValue({
      id: 'manager_1',
      organizationId: 'org_1',
      phoneNumber: '010-1234-5678',
      position: '원장',
      createdAt: new Date(),
    });
    await managerEntryPost(jsonRequest('http://localhost/api/manager-entry', { phoneNumber: '010-1234-5678' }));

    // No select-member call — activeMemberId is never set.
    const saveResponse = await recordsPost(
      jsonRequest('http://localhost/api/records', {
        documentTexts: [],
        recordingText: null,
        interviewRecord: { qaLog: [] },
        diagnosisResult: '천식 의심',
        precautions: '호흡기내과 방문 권장',
        notableFindings: null,
        isCritical: false,
      }),
    );

    expect(saveResponse.status).toBe(401);
    expect(createRecordMock).not.toHaveBeenCalled();
  });
});
