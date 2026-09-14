import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const createMemberMock = vi.fn();
const listMembersForOrganizationMock = vi.fn();
const uploadSignatureMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  createMember: (input: unknown) => createMemberMock(input),
  listMembersForOrganization: (organizationId: string) => listMembersForOrganizationMock(organizationId),
}));

vi.mock('@/lib/server/blob', () => ({
  uploadSignature: (organizationId: string, image: Buffer) => uploadSignatureMock(organizationId, image),
}));

import { POST, GET } from '@/app/api/dashboard/members/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/dashboard/members', body);
}

const validSignatureImage = 'data:image/png;base64,aGVsbG8=';

describe('POST /api/dashboard/members', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    createMemberMock.mockReset();
    uploadSignatureMock.mockReset();
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
        signatureImage: validSignatureImage,
      }),
    );
    expect(response.status).toBe(403);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('uploads the signature and creates a member scoped to the manager organization', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    uploadSignatureMock.mockResolvedValue('https://blob.example.com/signatures/org_1/abc.png');
    createMemberMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      consentSignatureUrl: 'https://blob.example.com/signatures/org_1/abc.png',
      createdAt: new Date(),
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(uploadSignatureMock).toHaveBeenCalledWith('org_1', expect.any(Buffer));
    expect(createMemberMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
      gender: 'male',
      ageBand: '30~34세',
      occupation: '회사원/직장인',
      consentSignatureUrl: 'https://blob.example.com/signatures/org_1/abc.png',
    });
    expect(data.member.consentSignatureUrl).toBe('https://blob.example.com/signatures/org_1/abc.png');
  });

  it('rejects malformed bodies', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(jsonRequest({ name: '홍길동' }));
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('rejects invalid enum values', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
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
        signatureImage: validSignatureImage,
      }),
    );
    expect(response.status).toBe(400);
    expect(createMemberMock).not.toHaveBeenCalled();
    expect(uploadSignatureMock).not.toHaveBeenCalled();
  });

  it('rejects a missing signatureImage', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
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
    expect(response.status).toBe(400);
    expect(uploadSignatureMock).not.toHaveBeenCalled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed signatureImage that is not a PNG data URL', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: 'not-a-data-url',
      }),
    );
    expect(response.status).toBe(400);
    expect(uploadSignatureMock).not.toHaveBeenCalled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('returns 500 and does not create a member when the signature upload fails', async () => {
    requireManagerMock.mockResolvedValue({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    uploadSignatureMock.mockRejectedValue(new Error('blob upload failed'));

    const response = await POST(
      jsonRequest({
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        gender: 'male',
        ageBand: '30~34세',
        occupation: '회사원/직장인',
        signatureImage: validSignatureImage,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: '서명 저장에 실패했습니다.' });
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
