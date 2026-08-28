import { describe, it, expect } from 'vitest';
import { mergeQuestions } from '@/lib/interview/mergeQuestions';

describe('mergeQuestions', () => {
  it('merges near-duplicate questions from two specialties into one entry', () => {
    const result = mergeQuestions([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        followUpQuestions: [{ question: '기침은 언제부터 시작됐나요?', reason: '기간 확인' }],
      },
      {
        specialtyId: 'internal-medicine',
        specialtyName: '내과',
        followUpQuestions: [{ question: '기침은 언제부터 시작됐나요?', reason: '증상 발생 시점' }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].askedBy).toHaveLength(2);
    expect(result[0].askedBy.map((a) => a.specialtyId)).toEqual(
      expect.arrayContaining(['pulmonology', 'internal-medicine']),
    );
  });

  it('keeps distinct questions separate', () => {
    const result = mergeQuestions([
      {
        specialtyId: 'pulmonology',
        specialtyName: '호흡기내과',
        followUpQuestions: [
          { question: '기침은 언제부터 시작됐나요?', reason: 'A' },
          { question: '가래에 피가 섞여 나오나요?', reason: 'B' },
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].askedBy).toHaveLength(1);
  });

  it('returns an empty array when there are no follow-up questions', () => {
    expect(mergeQuestions([{ specialtyId: 'x', specialtyName: 'X과', followUpQuestions: [] }])).toEqual([]);
  });
});
