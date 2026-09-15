import { describe, it, expect } from 'vitest';
import { SPECIALTY_CATALOG, getSpecialtyById } from '@/lib/agents/specialties';

describe('SPECIALTY_CATALOG', () => {
  it('has at least 6 specialties with unique ids', () => {
    const ids = SPECIALTY_CATALOG.map((s) => s.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every specialty has a non-empty systemPrompt', () => {
    for (const specialty of SPECIALTY_CATALOG) {
      expect(specialty.systemPrompt.length).toBeGreaterThan(20);
    }
  });
});

describe('getSpecialtyById', () => {
  it('finds an existing specialty', () => {
    expect(getSpecialtyById('pulmonology')?.name).toBe('호흡기내과');
  });

  it('includes 한의학 in the catalog', () => {
    expect(getSpecialtyById('oriental-medicine')?.name).toBe('한의학');
  });

  it('returns undefined for an unknown id', () => {
    expect(getSpecialtyById('not-a-real-specialty')).toBeUndefined();
  });
});
