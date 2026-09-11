import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireMemberMock = vi.fn();
const createRecordMock = vi.fn();
const listRecordsForUserMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireMember: () => requireMemberMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
  listRecordsForUser: (id: string) => listRecordsForUserMock(id),
}));

import { POST, GET } from '@/app/api/records/route';

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
  });

  it('returns 401 when the caller is a guest', async () => {
    requireMemberMock.mockRejectedValue(new Error('not signed in'));
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(401);
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('creates a record scoped to the server-derived viewer', async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: 'org_1' });
    createRecordMock.mockResolvedValue({ id: 'rec_1' });

    const response = await POST(
      jsonRequest({
        phoneNumber: '010-1234-5678',
        prescriptionText: null,
        recordingText: '전사문',
        interviewRecord: { qaLog: [] },
        isCritical: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_1', organizationId: 'org_1' }),
    );
  });

  it('rejects malformed bodies', async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: null });
    const response = await POST(jsonRequest({ phoneNumber: '010-0000-0000' }));
    expect(response.status).toBe(400);
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON', async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: 'org_1' });
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

describe('GET /api/records', () => {
  beforeEach(() => {
    requireMemberMock.mockReset();
    listRecordsForUserMock.mockReset();
  });

  it('returns 401 for guests', async () => {
    requireMemberMock.mockRejectedValue(new Error('not signed in'));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the caller's own records", async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: null });
    listRecordsForUserMock.mockResolvedValue([{ id: 'rec_1' }]);
    const response = await GET();
    const data = await response.json();
    expect(data.records).toEqual([{ id: 'rec_1' }]);
    expect(listRecordsForUserMock).toHaveBeenCalledWith('user_1');
  });
});
