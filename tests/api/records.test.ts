import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireMemberMock = vi.fn();
const createRecordMock = vi.fn();
const findMemberByIdMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireMember: () => requireMemberMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
}));

vi.mock('@/lib/server/organizations/repository', () => ({
  findMemberById: (id: string) => findMemberByIdMock(id),
}));

import { POST } from '@/app/api/records/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/records', () => {
  beforeEach(() => {
    requireMemberMock.mockReset();
    createRecordMock.mockReset();
    findMemberByIdMock.mockReset();
  });

  it('returns 401 when the caller has no active member session', async () => {
    requireMemberMock.mockRejectedValue(new Error('선택된 회원이 없습니다.'));
    const response = await POST(jsonRequest({}));
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe('저장 권한이 없습니다.');
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('creates a record scoped to the server-derived viewer, with member snapshot and diagnosis fields', async () => {
    requireMemberMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    findMemberByIdMock.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_1',
      name: '홍길동',
      phoneNumber: '010-1234-5678',
    });
    createRecordMock.mockResolvedValue({ id: 'rec_1' });

    const response = await POST(
      jsonRequest({
        documentTexts: ['처방전 텍스트'],
        recordingText: '전사문',
        interviewRecord: { qaLog: [] },
        diagnosisResult: '천식 의심',
        precautions: '호흡기내과 방문 권장',
        notableFindings: null,
        isCritical: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(findMemberByIdMock).toHaveBeenCalledWith('member_1');
    expect(createRecordMock).toHaveBeenCalledWith({
      memberId: 'member_1',
      organizationId: 'org_1',
      memberName: '홍길동',
      memberPhoneNumber: '010-1234-5678',
      documentTexts: ['처방전 텍스트'],
      recordingText: '전사문',
      interviewRecord: { qaLog: [] },
      diagnosisResult: '천식 의심',
      precautions: '호흡기내과 방문 권장',
      notableFindings: null,
      isCritical: false,
    });
  });

  it('returns 404 when the active member no longer exists', async () => {
    requireMemberMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    findMemberByIdMock.mockResolvedValue(null);

    const response = await POST(
      jsonRequest({
        documentTexts: [],
        recordingText: null,
        interviewRecord: { qaLog: [] },
        diagnosisResult: '천식 의심',
        precautions: '호흡기내과 방문 권장',
        notableFindings: null,
        isCritical: false,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '회원 정보를 찾을 수 없습니다.' });
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies', async () => {
    requireMemberMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    const response = await POST(jsonRequest({ documentTexts: 'not-an-array' }));
    expect(response.status).toBe(400);
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('rejects a body missing diagnosisResult or precautions', async () => {
    requireMemberMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    const response = await POST(
      jsonRequest({
        documentTexts: [],
        recordingText: null,
        interviewRecord: { qaLog: [] },
        notableFindings: null,
        isCritical: false,
      }),
    );
    expect(response.status).toBe(400);
    expect(findMemberByIdMock).not.toHaveBeenCalled();
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON', async () => {
    requireMemberMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    const response = await POST(
      new Request('http://localhost/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(response.status).toBe(400);
    expect(createRecordMock).not.toHaveBeenCalled();
  });
});
