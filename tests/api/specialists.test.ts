// tests/api/specialists.test.ts
import { describe, it, expect, vi } from 'vitest';

const runSpecialistAnalysisMock = vi.fn(
  async (specialtyId: string, _transcript: string, _profile: unknown) => ({
    specialtyId,
    specialtyName: specialtyId === 'pulmonology' ? '호흡기내과' : '심장내과',
    suspectedConditions: [],
    followUpQuestions: [],
  }),
);
const getPatientProfileMock = vi.fn(
  async (): Promise<{ ageBand: string; gender: string; occupation: string } | null> => null,
);

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistAnalysis: (specialtyId: string, transcript: string, profile: unknown) =>
    runSpecialistAnalysisMock(specialtyId, transcript, profile),
}));
vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: () => getPatientProfileMock(),
}));

import { POST } from '@/app/api/specialists/route';

describe('POST /api/specialists', () => {
  it('runs analysis for every requested specialty', async () => {
    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: ['pulmonology', 'cardiology'] }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.opinions).toHaveLength(2);
  });

  it('returns 400 when specialtyIds is empty', async () => {
    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('fetches the patient profile once and forwards it to every specialty call', async () => {
    runSpecialistAnalysisMock.mockClear();
    getPatientProfileMock.mockResolvedValueOnce({ ageBand: '30~34세', gender: 'female', occupation: '학생' });

    const request = new Request('http://localhost/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '증상 설명', specialtyIds: ['pulmonology', 'cardiology'] }),
    });
    await POST(request);

    const profile = { ageBand: '30~34세', gender: 'female', occupation: '학생' };
    expect(runSpecialistAnalysisMock).toHaveBeenCalledWith('pulmonology', '증상 설명', profile);
    expect(runSpecialistAnalysisMock).toHaveBeenCalledWith('cardiology', '증상 설명', profile);
  });
});
