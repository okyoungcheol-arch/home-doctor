// tests/api/triage.test.ts
import { describe, it, expect, vi } from 'vitest';

const runTriageMock = vi.fn(async () => ({ specialties: [{ id: 'pulmonology', reason: '기침 언급' }] }));
const getPatientProfileMock = vi.fn(async () => null);

vi.mock('@/lib/agents/triage', () => ({
  runTriage: (transcript: string, profile: unknown) => runTriageMock(transcript, profile),
}));
vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: () => getPatientProfileMock(),
}));

import { POST } from '@/app/api/triage/route';

describe('POST /api/triage', () => {
  it('returns triage specialties and emergency flags for a valid transcript', async () => {
    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '가슴이 답답하고 숨이 차서 쓰러질 것 같아요.' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.specialties[0].id).toBe('pulmonology');
    expect(data.specialties[0].name).toBe('호흡기내과');
    expect(data.emergency.isEmergency).toBe(true);
  });

  it('returns 400 when transcript is missing', async () => {
    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('fetches the patient profile from the server session and forwards it to runTriage', async () => {
    runTriageMock.mockClear();
    getPatientProfileMock.mockResolvedValueOnce({ ageBand: '60~64세', gender: 'male', occupation: '농업' });

    const request = new Request('http://localhost/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '기침이 심해요.' }),
    });
    await POST(request);

    expect(runTriageMock).toHaveBeenCalledWith('기침이 심해요.', {
      ageBand: '60~64세',
      gender: 'male',
      occupation: '농업',
    });
  });
});
