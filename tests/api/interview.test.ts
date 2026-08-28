import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/agents/specialist', () => ({
  runSpecialistFollowUp: vi.fn(async () => ({
    suspectedConditions: [{ name: '천식', confidence: 0.7, rationale: '운동 시 호흡곤란 확인됨' }],
    followUpQuestions: [],
  })),
}));

import { POST } from '@/app/api/interview/route';

describe('POST /api/interview', () => {
  it('returns an updated opinion and emergency flags', async () => {
    const request = new Request('http://localhost/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialtyId: 'pulmonology',
        transcript: '기침이 계속됩니다.',
        priorOpinion: {
          specialtyId: 'pulmonology',
          specialtyName: '호흡기내과',
          suspectedConditions: [],
          followUpQuestions: [],
        },
        question: '운동 시 숨이 차나요?',
        answerText: '네, 계단을 오르면 숨이 찹니다.',
      }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.opinion.suspectedConditions[0].name).toBe('천식');
    expect(data.emergency).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
