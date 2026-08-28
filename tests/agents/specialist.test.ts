import { describe, it, expect, vi } from 'vitest';

type PromptMessage = { role: string; content: Array<{ type: string; [key: string]: unknown }> };
type GenerateObjectCallArgs = { prompt: string | PromptMessage[] };

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(async (_options: GenerateObjectCallArgs) => ({
    object: {
      suspectedConditions: [{ name: '천식', confidence: 0.5, rationale: '마른기침' }],
      followUpQuestions: [{ question: '운동 시 숨이 차나요?', reason: '천식 확인' }],
    },
  })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: mockGenerateObject };
});

import { runSpecialistAnalysis, runSpecialistFollowUp } from '@/lib/agents/specialist';

describe('runSpecialistAnalysis', () => {
  it('attaches the specialty id and name to the model output', async () => {
    const opinion = await runSpecialistAnalysis('pulmonology', '기침이 오래갑니다.');
    expect(opinion.specialtyId).toBe('pulmonology');
    expect(opinion.specialtyName).toBe('호흡기내과');
    expect(opinion.suspectedConditions[0].name).toBe('천식');
  });

  it('throws for an unknown specialty id', async () => {
    await expect(runSpecialistAnalysis('not-real', '증상')).rejects.toThrow();
  });
});

describe('runSpecialistFollowUp', () => {
  it('sends a plain text prompt when no attachment is provided', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistFollowUp(
      'pulmonology',
      '기침이 오래갑니다.',
      { specialtyId: 'pulmonology', specialtyName: '호흡기내과', suspectedConditions: [], followUpQuestions: [] },
      { question: '운동 시 숨이 차나요?', answerText: '네, 계단을 오를 때 숨이 찹니다.' },
    );
    const call = mockGenerateObject.mock.calls[0][0];
    expect(typeof call.prompt).toBe('string');
  });

  it('sends a multimodal prompt when an attachment is provided', async () => {
    mockGenerateObject.mockClear();
    await runSpecialistFollowUp(
      'dermatology',
      '피부에 발진이 있습니다.',
      { specialtyId: 'dermatology', specialtyName: '피부과', suspectedConditions: [], followUpQuestions: [] },
      {
        question: '사진을 보여주실 수 있나요?',
        answerText: '사진을 첨부합니다.',
        attachment: { data: 'ZmFrZQ==', mediaType: 'image/png', filename: 'rash.png' },
      },
    );
    const call = mockGenerateObject.mock.calls[0][0];
    expect(Array.isArray(call.prompt)).toBe(true);
    const prompt = call.prompt as PromptMessage[];
    expect(prompt[0].content[1].type).toBe('file');
  });
});
