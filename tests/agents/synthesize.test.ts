import { describe, it, expect, vi } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(async (_options: { prompt: string }) => ({
    object: {
      overallImpression: '호흡기 증상이 우세하며 천식 가능성이 있습니다.',
      topDifferentials: [
        { condition: '천식', supportingSpecialties: ['호흡기내과', '내과'], confidence: 0.6 },
      ],
      recommendedActions: ['호흡기내과 방문 및 폐기능 검사 권장'],
      redFlags: [],
      severityLevel: 2,
    },
  })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: generateObjectMock,
  };
});

import { runSynthesis } from '@/lib/agents/synthesize';

describe('runSynthesis', () => {
  it('returns the synthesis report from the model', async () => {
    const report = await runSynthesis([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        suspectedConditions: [{ name: '천식', confidence: 0.6, rationale: '마른기침' }],
        followUpQuestions: [],
      },
    ]);

    expect(report.overallImpression).toContain('천식');
    expect(report.topDifferentials[0].condition).toBe('천식');
  });

  it('does not include a history section in the prompt when pastRecordsSummary is omitted', async () => {
    generateObjectMock.mockClear();
    await runSynthesis([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        suspectedConditions: [{ name: '천식', confidence: 0.6, rationale: '마른기침' }],
        followUpQuestions: [],
      },
    ]);

    const call = generateObjectMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).not.toContain('과거 문진 기록');
  });

  it('does not include a history section when pastRecordsSummary is null', async () => {
    generateObjectMock.mockClear();
    await runSynthesis(
      [
        {
          specialtyId: 'pulmonology',
          specialtyName: '호흡기내과',
          suspectedConditions: [{ name: '천식', confidence: 0.6, rationale: '마른기침' }],
          followUpQuestions: [],
        },
      ],
      null,
    );

    const call = generateObjectMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).not.toContain('과거 문진 기록');
  });

  it('includes a clearly-labeled history section in the prompt when pastRecordsSummary is provided', async () => {
    generateObjectMock.mockClear();
    const pastRecordsSummary = '- [2026-08-01] 진단: 경미한 기침 / 특이사항: 없음';

    await runSynthesis(
      [
        {
          specialtyId: 'pulmonology',
          specialtyName: '호흡기내과',
          suspectedConditions: [{ name: '천식', confidence: 0.6, rationale: '마른기침' }],
          followUpQuestions: [],
        },
      ],
      pastRecordsSummary,
    );

    const call = generateObjectMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('과거 문진 기록');
    expect(call.prompt).toContain(pastRecordsSummary);
    expect(call.prompt).toContain('악화');
  });
});
