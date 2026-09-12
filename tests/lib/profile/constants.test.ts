import { describe, it, expect } from 'vitest';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS } from '@/lib/profile/constants';

describe('AGE_BANDS', () => {
  it('has 18 five-year bands from under 10 to 90+', () => {
    expect(AGE_BANDS).toHaveLength(18);
    expect(AGE_BANDS[0]).toBe('10세 미만');
    expect(AGE_BANDS.at(-1)).toBe('90세 이상');
    expect(AGE_BANDS).toContain('60~64세');
  });
});

describe('GENDER_OPTIONS', () => {
  it('offers male, female, and unspecified', () => {
    expect(GENDER_OPTIONS).toHaveLength(3);
    expect(GENDER_OPTIONS.map((g) => g.value)).toEqual(['male', 'female', 'unspecified']);
    expect(GENDER_OPTIONS.find((g) => g.value === 'male')?.label).toBe('남성');
  });
});

describe('OCCUPATIONS', () => {
  it('includes farming as a fixed category', () => {
    expect(OCCUPATIONS).toHaveLength(7);
    expect(OCCUPATIONS).toContain('농업');
    expect(OCCUPATIONS).toContain('기타');
  });
});
