import { describe, it, expect } from 'vitest';
import { specialistFindingsSchema, synthesisReportSchema } from '@/lib/ai/schemas';

describe('specialistFindingsSchema', () => {
  it('accepts a valid findings object', () => {
    const result = specialistFindingsSchema.safeParse({
      suspectedConditions: [
        { name: '천식', confidence: 0.6, rationale: '마른기침과 야간 악화' },
      ],
      followUpQuestions: [
        { question: '운동 시 숨이 차나요?', reason: '천식 악화 요인 확인' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence outside the 0-1 range', () => {
    const result = specialistFindingsSchema.safeParse({
      suspectedConditions: [{ name: '천식', confidence: 1.5, rationale: '테스트' }],
      followUpQuestions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('synthesisReportSchema', () => {
  it('accepts a valid report', () => {
    const result = synthesisReportSchema.safeParse({
      overallImpression: '호흡기 증상이 우세합니다.',
      topDifferentials: [
        { condition: '천식', supportingSpecialties: ['호흡기내과'], confidence: 0.6 },
      ],
      recommendedActions: ['호흡기내과 방문 권장'],
      redFlags: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty recommendedActions array', () => {
    const result = synthesisReportSchema.safeParse({
      overallImpression: '요약',
      topDifferentials: [],
      recommendedActions: [],
      redFlags: [],
    });
    expect(result.success).toBe(false);
  });
});
