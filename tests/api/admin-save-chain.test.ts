import { describe, it, expect, vi, beforeEach } from 'vitest';

// True end-to-end coverage for the admin auth path, addressing the FINAL WHOLE-BRANCH
// REVIEW's recommendation that mirrors tests/api/manager-save-chain.test.ts: admin-entry ->
// signed cookie -> getViewer -> requireAdmin, with only the DB/repository layer mocked. Every
// other per-route test in this suite mocks '@/lib/server/auth/authorize' and/or
// '@/lib/server/auth/session' wholesale, so no single test previously verified that a real
// signed cookie issued by /api/admin-entry actually carries through readSession/getViewer to
// authorize a later admin-only route, nor that a manager cookie is correctly rejected by an
// admin route and vice versa.
//
// 'next/headers' is mocked (no real Next.js server runtime is available in this test
// environment); its cookies() returns one shared in-memory store for the whole test, simulating
// a browser holding the session cookie across requests. lib/server/auth/session.ts and
// lib/server/auth/authorize.ts run for real — this file does NOT mock either of them.

const findAdminByPhoneNumberMock = vi.fn();
const findManagerByPhoneNumberMock = vi.fn();
const listOrganizationsMock = vi.fn();
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

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

vi.mock('@/lib/server/admins/repository', () => ({
  findAdminByPhoneNumber: (phoneNumber: string) => findAdminByPhoneNumberMock(phoneNumber),
}));

const findOrganizationByIdMock = vi.fn();
const findMemberInOrganizationMock = vi.fn();

vi.mock('@/lib/server/organizations/repository', () => ({
  findManagerByPhoneNumber: (phoneNumber: string) => findManagerByPhoneNumberMock(phoneNumber),
  listOrganizations: () => listOrganizationsMock(),
  findOrganizationById: (id: string) => findOrganizationByIdMock(id),
  findMemberInOrganization: (id: string, organizationId: string) =>
    findMemberInOrganizationMock(id, organizationId),
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
}));

import { POST as adminEntryPost } from '@/app/api/admin-entry/route';
import { POST as managerEntryPost } from '@/app/api/manager-entry/route';
import { GET as adminOrganizationsGet } from '@/app/api/admin/organizations/route';
import { POST as recordsPost } from '@/app/api/records/route';
import { POST as selectOrganizationPost } from '@/app/api/admin/select-organization/route';
import { POST as selectMemberPost } from '@/app/api/dashboard/select-member/route';
import { getViewer } from '@/lib/server/auth/authorize';
import { jsonRequest } from '@/tests/helpers/request';

describe('admin-entry -> admin route / cross-role rejection (real session/cookie, DB-mocked)', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-only-for-vitest-do-not-use-elsewhere';
    cookieState.clear();
    findAdminByPhoneNumberMock.mockReset();
    findManagerByPhoneNumberMock.mockReset();
    listOrganizationsMock.mockReset();
    createRecordMock.mockReset();
    findOrganizationByIdMock.mockReset();
    findMemberInOrganizationMock.mockReset();
  });

  it('lets an admin act as a manager: select organization -> select member -> save -> switch organization', async () => {
    const ORG_A = '11111111-1111-4111-8111-111111111111';
    const ORG_B = '22222222-2222-4222-8222-222222222222';
    findAdminByPhoneNumberMock.mockResolvedValue({ id: 'admin_1', phoneNumber: '01011112222', name: '관리자' });
    await adminEntryPost(jsonRequest('http://localhost/api/admin-entry', { phoneNumber: '010-1111-2222' }));

    // 단체를 고르기 전에는 매니저 전용 라우트가 막혀 있다.
    const beforeSelect = await selectMemberPost(
      jsonRequest('http://localhost/api/dashboard/select-member', { memberId: 'member_1' }),
    );
    expect(beforeSelect.status).toBe(403);

    findOrganizationByIdMock.mockResolvedValue({ id: ORG_A, name: '단체 A' });
    const orgResponse = await selectOrganizationPost(
      jsonRequest('http://localhost/api/admin/select-organization', { organizationId: ORG_A }),
    );
    expect(orgResponse.status).toBe(200);
    expect(await getViewer()).toEqual({ role: 'admin', organizationId: ORG_A, adminId: 'admin_1' });

    findMemberInOrganizationMock.mockResolvedValue({
      id: 'member_1',
      organizationId: ORG_A,
      name: '홍길동',
      phoneNumber: '01099998888',
    });
    const memberResponse = await selectMemberPost(
      jsonRequest('http://localhost/api/dashboard/select-member', { memberId: 'member_1' }),
    );
    expect(memberResponse.status).toBe(200);
    // 회원 조회는 관리자가 고른 단체로 한정된다.
    expect(findMemberInOrganizationMock).toHaveBeenCalledWith('member_1', ORG_A);

    createRecordMock.mockResolvedValue({ id: 'record_1' });
    const saveResponse = await recordsPost(
      jsonRequest('http://localhost/api/records', {
        documentTexts: [],
        recordingText: null,
        interviewRecord: {},
        diagnosisResult: '감기 의심',
        precautions: '휴식',
        notableFindings: null,
        isCritical: false,
        severityLevel: 1,
      }),
    );
    expect(saveResponse.status).toBe(200);
    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'member_1', organizationId: ORG_A, memberName: '홍길동' }),
    );
    // 저장 후 활성 회원은 해제되지만 관리자 신원과 단체 선택은 유지된다.
    expect(await getViewer()).toEqual({ role: 'admin', organizationId: ORG_A, adminId: 'admin_1' });

    // 다른 단체로 바꾸면 이전 단체에서 고른 회원이 따라오지 않는다.
    await selectMemberPost(jsonRequest('http://localhost/api/dashboard/select-member', { memberId: 'member_1' }));
    findOrganizationByIdMock.mockResolvedValue({ id: ORG_B, name: '단체 B' });
    await selectOrganizationPost(
      jsonRequest('http://localhost/api/admin/select-organization', { organizationId: ORG_B }),
    );
    expect(await getViewer()).toEqual({ role: 'admin', organizationId: ORG_B, adminId: 'admin_1' });

    // 관리자 권한도 그대로 유지된다.
    listOrganizationsMock.mockResolvedValue([]);
    expect((await adminOrganizationsGet()).status).toBe(200);
  });

  it('does not let a manager switch organizations', async () => {
    findManagerByPhoneNumberMock.mockResolvedValue({ id: 'manager_1', organizationId: 'org_1' });
    await managerEntryPost(jsonRequest('http://localhost/api/manager-entry', { phoneNumber: '010-1234-5678' }));

    const response = await selectOrganizationPost(
      jsonRequest('http://localhost/api/admin/select-organization', {
        organizationId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(response.status).toBe(403);
    expect(await getViewer()).toMatchObject({ role: 'manager', organizationId: 'org_1' });
  });

  it('carries a real signed cookie through admin-entry -> getViewer -> an admin-only route', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue({
      id: 'admin_1',
      phoneNumber: '010-1111-2222',
      name: '관리자',
      createdAt: new Date(),
    });

    const entryResponse = await adminEntryPost(
      jsonRequest('http://localhost/api/admin-entry', { phoneNumber: '010-1111-2222' }),
    );
    expect(entryResponse.status).toBe(200);
    expect(cookieState.has('hd_session')).toBe(true);

    // getViewer() now reads the real cookie just set above.
    expect(await getViewer()).toEqual({
      role: 'admin',
      organizationId: null,
      adminId: 'admin_1',
    });

    listOrganizationsMock.mockResolvedValue([{ id: 'org_1', name: '샘플 병원' }]);

    const orgsResponse = await adminOrganizationsGet();
    expect(orgsResponse.status).toBe(200);
  });

  it('rejects a manager cookie at an admin-only route with 403', async () => {
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

    const orgsResponse = await adminOrganizationsGet();
    expect(orgsResponse.status).toBe(403);
    expect(await orgsResponse.json()).toEqual({ error: 'admin 권한이 필요합니다.' });
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  it('rejects an admin cookie at a member-only route with 401', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue({
      id: 'admin_1',
      phoneNumber: '010-1111-2222',
      name: '관리자',
      createdAt: new Date(),
    });

    const entryResponse = await adminEntryPost(
      jsonRequest('http://localhost/api/admin-entry', { phoneNumber: '010-1111-2222' }),
    );
    expect(entryResponse.status).toBe(200);

    // requireMember() runs (and rejects) before body parsing, so the exact shape of the body
    // is irrelevant here — the request never gets past the guard.
    const saveResponse = await recordsPost(jsonRequest('http://localhost/api/records', {}));

    expect(saveResponse.status).toBe(401);
    expect(await saveResponse.json()).toEqual({ error: '저장 권한이 없습니다.' });
    expect(createRecordMock).not.toHaveBeenCalled();
  });
});
