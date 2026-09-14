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

vi.mock('@/lib/server/organizations/repository', () => ({
  findManagerByPhoneNumber: (phoneNumber: string) => findManagerByPhoneNumberMock(phoneNumber),
  listOrganizations: () => listOrganizationsMock(),
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
}));

import { POST as adminEntryPost } from '@/app/api/admin-entry/route';
import { POST as managerEntryPost } from '@/app/api/manager-entry/route';
import { GET as adminOrganizationsGet } from '@/app/api/admin/organizations/route';
import { POST as recordsPost } from '@/app/api/records/route';
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
