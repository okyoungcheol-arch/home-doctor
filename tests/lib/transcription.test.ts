import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    transcribe: vi.fn(async () => ({
      text: '기침이 3일째 계속되고 있어요.',
      segments: [],
      language: 'ko',
      durationInSeconds: 8.2,
      warnings: [],
    })),
  };
});

import { transcribeAudio } from '@/lib/ai/transcription';

describe('transcribeAudio', () => {
  it('returns the transcript text, language, and duration', async () => {
    const result = await transcribeAudio(new Uint8Array([0, 1, 2]));
    expect(result.text).toBe('기침이 3일째 계속되고 있어요.');
    expect(result.language).toBe('ko');
    expect(result.durationInSeconds).toBeCloseTo(8.2);
  });
});
