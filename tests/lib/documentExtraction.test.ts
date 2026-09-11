import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(async () => ({
      text: '처방전: 아모잭신 250mg 1일 3회, 진단명: 급성 인두염',
    })),
  };
});

import { extractDocumentText } from '@/lib/ai/documentExtraction';

describe('extractDocumentText', () => {
  it('returns the extracted document text', async () => {
    const result = await extractDocumentText({
      data: new Uint8Array([0, 1, 2]),
      mediaType: 'image/png',
      filename: 'prescription.png',
    });
    expect(result.text).toBe('처방전: 아모잭신 250mg 1일 3회, 진단명: 급성 인두염');
  });
});
