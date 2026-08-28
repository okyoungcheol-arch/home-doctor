import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistAnalysis: vi.fn(async (specialtyId: string) => ({
    specialtyId,
    specialtyName: specialtyId === 'pulmonology' ? '호흡기내과' : '심장내과',
    suspectedConditions: [],
    followUpQuestions: [],
  })),
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
});
