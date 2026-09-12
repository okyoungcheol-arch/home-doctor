// tests/agents/triage.test.ts
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(async () => ({
    object: {
      specialties: [
        { id: 'pulmonology', reason: '기침과 호흡곤란 언급' },
        { id: 'cardiology', reason: '가슴 답답함 언급' },
      ],
    },
  })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: mockGenerateObject };
});

import { runTriage, triageResultSchema } from '@/lib/agents/triage';

describe('runTriage', () => {
  it('returns the specialties chosen by the model', async () => {
    const result = await runTriage('기침이 심하고 가슴이 답답해요.');
    expect(result.specialties).toHaveLength(2);
    expect(result.specialties[0].id).toBe('pulmonology');
  });

  it('works without a patient profile (backward compatible)', async () => {
    mockGenerateObject.mockClear();
    await runTriage('기침이 심하고 가슴이 답답해요.');
    const call = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).not.toContain('환자 기본정보');
  });

  it('includes the patient profile line in the prompt when provided', async () => {
    mockGenerateObject.mockClear();
    await runTriage('기침이 심하고 가슴이 답답해요.', { ageBand: '60~64세', gender: 'male', occupation: '농업' });
    const call = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('환자 기본정보: 연령대 60~64세, 성별 남성, 직업 농업');
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
