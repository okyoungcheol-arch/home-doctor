import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/triage', () => ({
  runTriage: vi.fn(async () => ({ specialties: [{ id: 'pulmonology', reason: '기침 언급' }] })),
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
});
