import { describe, it, expect, vi, beforeEach } from 'vitest';

const runSynthesisMock = vi.fn(
  async (_opinions: unknown[], _pastRecordsSummary?: string | null) => ({
    overallImpression: '호흡기 증상이 우세합니다.',
    topDifferentials: [],
    recommendedActions: ['경과 관찰'],
    redFlags: [],
  }),
);

const getViewerMock = vi.fn();
const listRecordsForMemberMock = vi.fn();

vi.mock('@/lib/agents/synthesize', () => ({
  runSynthesis: (opinions: unknown[], pastRecordsSummary?: string | null) =>
    runSynthesisMock(opinions, pastRecordsSummary),
}));

vi.mock('@/lib/server/auth/authorize', () => ({
  getViewer: () => getViewerMock(),
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForMember: (memberId: string) => listRecordsForMemberMock(memberId),
}));

import { POST } from '@/app/api/synthesize/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const sampleOpinions = [
  { specialtyId: 'pulmonology', specialtyName: '호흡기내과', suspectedConditions: [], followUpQuestions: [] },
];

describe('POST /api/synthesize', () => {
  beforeEach(() => {
    runSynthesisMock.mockClear();
    getViewerMock.mockReset();
    listRecordsForMemberMock.mockReset();
  });

  it('returns a synthesis report', async () => {
    getViewerMock.mockResolvedValue({ role: 'guest', userId: null, organizationId: null });

    const response = await POST(jsonRequest({ opinions: sampleOpinions }));
    const data = await response.json();
    expect(data.report.overallImpression).toBe('호흡기 증상이 우세합니다.');
  });

  it('returns 400 when opinions is empty', async () => {
    const response = await POST(jsonRequest({ opinions: [] }));
    expect(response.status).toBe(400);
    expect(getViewerMock).not.toHaveBeenCalled();
  });

  it('guests call runSynthesis with no history (no active member, no lookup)', async () => {
    getViewerMock.mockResolvedValue({ role: 'guest', userId: null, organizationId: null });

    await POST(jsonRequest({ opinions: sampleOpinions }));

    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
    expect(runSynthesisMock).toHaveBeenCalledWith(sampleOpinions, null);
  });

  it('manager with active member and past records passes a non-null summary capped at 3', async () => {
    getViewerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    listRecordsForMemberMock.mockResolvedValue([
      { recordDate: new Date('2026-09-01'), diagnosisResult: '진단1', notableFindings: '특이1' },
      { recordDate: new Date('2026-08-01'), diagnosisResult: '진단2', notableFindings: null },
      { recordDate: new Date('2026-07-01'), diagnosisResult: '진단3', notableFindings: '특이3' },
      { recordDate: new Date('2026-06-01'), diagnosisResult: '진단4', notableFindings: '특이4' },
    ]);

    await POST(jsonRequest({ opinions: sampleOpinions }));

    expect(listRecordsForMemberMock).toHaveBeenCalledWith('member_1');
    expect(runSynthesisMock).toHaveBeenCalledTimes(1);
    const [, summary] = runSynthesisMock.mock.calls[0];
    expect(summary).not.toBeNull();
    expect(typeof summary).toBe('string');
    expect((summary as string).split('\n')).toHaveLength(3);
    expect(summary).toContain('진단1');
    expect(summary).toContain('진단2');
    expect(summary).toContain('진단3');
    expect(summary).not.toContain('진단4');
  });

  it('manager with active member but no past records passes null history', async () => {
    getViewerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
    listRecordsForMemberMock.mockResolvedValue([]);

    await POST(jsonRequest({ opinions: sampleOpinions }));

    expect(listRecordsForMemberMock).toHaveBeenCalledWith('member_1');
    expect(runSynthesisMock).toHaveBeenCalledWith(sampleOpinions, null);
  });

  it('manager without an active member skips the history lookup entirely', async () => {
    getViewerMock.mockResolvedValue({
      role: 'manager',
      userId: null,
      organizationId: 'org_1',
      managerId: 'manager_1',
    });

    await POST(jsonRequest({ opinions: sampleOpinions }));

    expect(listRecordsForMemberMock).not.toHaveBeenCalled();
    expect(runSynthesisMock).toHaveBeenCalledWith(sampleOpinions, null);
  });
});
