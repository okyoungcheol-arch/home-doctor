import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/transcription', () => ({
  transcribeAudio: vi.fn(async () => ({ text: '테스트 전사', language: 'ko', durationInSeconds: 3 })),
}));

import { POST } from '@/app/api/transcribe/route';

describe('POST /api/transcribe', () => {
  it('transcribes an uploaded audio file', async () => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'test.webm', { type: 'audio/webm' }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('테스트 전사');
  });

  it('returns 400 when no audio file is provided', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
