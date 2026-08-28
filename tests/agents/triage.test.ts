import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: vi.fn(async () => ({
      object: {
        specialties: [
          { id: 'pulmonology', reason: '기침과 호흡곤란 언급' },
          { id: 'cardiology', reason: '가슴 답답함 언급' },
        ],
      },
    })),
  };
});

import { runTriage, triageResultSchema } from '@/lib/agents/triage';

describe('runTriage', () => {
  it('returns the specialties chosen by the model', async () => {
    const result = await runTriage('기침이 심하고 가슴이 답답해요.');
    expect(result.specialties).toHaveLength(2);
    expect(result.specialties[0].id).toBe('pulmonology');
  });
});

describe('triageResultSchema', () => {
  it('rejects an id that is not in the specialty catalog', () => {
    const result = triageResultSchema.safeParse({
      specialties: [{ id: 'not-a-real-specialty', reason: 'test' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 specialties', () => {
    const result = triageResultSchema.safeParse({
      specialties: [{ id: 'pulmonology', reason: 'test' }],
    });
    expect(result.success).toBe(false);
  });
});
