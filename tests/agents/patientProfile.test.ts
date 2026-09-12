import { describe, it, expect } from 'vitest';
import { formatPatientProfileLine, type PatientProfile } from '@/lib/agents/patientProfile';

describe('formatPatientProfileLine', () => {
  it('returns empty string for null profile', () => {
    expect(formatPatientProfileLine(null)).toBe('');
  });

  it('returns empty string when every field is empty', () => {
    const profile: PatientProfile = { ageBand: '', gender: '', occupation: '' };
    expect(formatPatientProfileLine(profile)).toBe('');
  });

  it('includes all three fields with Korean gender label when fully filled', () => {
    const profile: PatientProfile = { ageBand: '60~64세', gender: 'male', occupation: '농업' };
    const line = formatPatientProfileLine(profile);
    expect(line).toContain('연령대 60~64세');
    expect(line).toContain('성별 남성');
    expect(line).toContain('직업 농업');
  });

  it('includes only the fields that are present', () => {
    const profile: PatientProfile = { ageBand: '30~34세', gender: '', occupation: '' };
    const line = formatPatientProfileLine(profile);
    expect(line).toContain('연령대 30~34세');
    expect(line).not.toContain('성별');
    expect(line).not.toContain('직업');
  });
});
