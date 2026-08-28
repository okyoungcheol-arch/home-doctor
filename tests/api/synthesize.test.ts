import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/synthesize', () => ({
  runSynthesis: vi.fn(async () => ({
    overallImpression: '호흡기 증상이 우세합니다.',
    topDifferentials: [],
    recommendedActions: ['경과 관찰'],
    redFlags: [],
  })),
}));

import { POST } from '@/app/api/synthesize/route';

describe('POST /api/synthesize', () => {
  it('returns a synthesis report', async () => {
    const request = new Request('http://localhost/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opinions: [
          { specialtyId: 'pulmonology', specialtyName: '호흡기내과', suspectedConditions: [], followUpQuestions: [] },
        ],
      }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.report.overallImpression).toBe('호흡기 증상이 우세합니다.');
  });

  it('returns 400 when opinions is empty', async () => {
    const request = new Request('http://localhost/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opinions: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
