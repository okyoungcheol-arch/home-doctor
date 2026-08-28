import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: vi.fn(async () => ({
      object: {
        overallImpression: '호흡기 증상이 우세하며 천식 가능성이 있습니다.',
        topDifferentials: [
          { condition: '천식', supportingSpecialties: ['호흡기내과', '내과'], confidence: 0.6 },
        ],
        recommendedActions: ['호흡기내과 방문 및 폐기능 검사 권장'],
        redFlags: [],
      },
    })),
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
});
