import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/transcription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/transcription')>()),
  transcribeAudio: vi.fn(async () => ({ text: '테스트 전사', language: 'ko', durationInSeconds: 3 })),
}));

import { NoTranscriptGeneratedError } from 'ai';
import { transcribeAudio } from '@/lib/ai/transcription';
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

  it.each([
    ['prescription.png', 'image/png'],
    ['result.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain'],
  ])('returns 400 for a non-audio file (%s)', async (filename, type) => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], filename, { type }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  function audioRequest() {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'recording.m4a', { type: 'audio/mp4' }));
    return new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
  }

  it('returns 422 with a clear message when no speech was recognized', async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new NoTranscriptGeneratedError({ responses: [] }));
    const response = await POST(audioRequest());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('말소리를 인식하지 못했습니다');
  });

  it('reports an AI Gateway authentication failure distinctly', async () => {
    const authError = Object.assign(new Error('No authentication provided'), { name: 'GatewayAuthenticationError' });
    vi.mocked(transcribeAudio).mockRejectedValueOnce(authError);
    const response = await POST(audioRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('인증');
  });

  it('returns a generic 502 for other transcription failures', async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error('boom'));
    const response = await POST(audioRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe('파일을 텍스트로 변환하지 못했습니다.');
  });

  it('returns 400 when no file is provided', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
