import { describe, it, expect } from 'vitest';
import { checkEmergency } from '@/lib/safety/emergencyCheck';

describe('checkEmergency', () => {
  it('flags a single strong trigger keyword', () => {
    const result = checkEmergency('갑자기 의식을 잃고 쓰러졌어요.');
    expect(result.isEmergency).toBe(true);
    expect(result.matchedFlags).toContain('의식 소실');
  });

  it('flags a paired trigger (chest pain + breathing difficulty)', () => {
    const result = checkEmergency('가슴이 답답하고 숨이 차서 힘들어요.');
    expect(result.isEmergency).toBe(true);
    expect(result.matchedFlags).toContain('가슴 통증 동반 호흡곤란');
  });

  it('does not flag a pair when only one side is present', () => {
    const result = checkEmergency('가슴이 답답하지만 숨쉬기는 편해요.');
    expect(result.matchedFlags).not.toContain('가슴 통증 동반 호흡곤란');
  });

  it('returns no flags for a benign transcript', () => {
    const result = checkEmergency('며칠 전부터 마른기침이 계속돼요.');
    expect(result.isEmergency).toBe(false);
    expect(result.matchedFlags).toHaveLength(0);
  });
});
