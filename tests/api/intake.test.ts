import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/transcription', () => ({
  transcribeAudio: vi.fn(async () => ({ text: '녹음 전사 결과', language: 'ko', durationInSeconds: 3 })),
}));

vi.mock('@/lib/ai/documentExtraction', () => ({
  extractDocumentText: vi.fn(async () => ({ text: '문서 분석 결과' })),
}));

import { extractDocumentText } from '@/lib/ai/documentExtraction';
import { transcribeAudio } from '@/lib/ai/transcription';
import { POST } from '@/app/api/intake/route';

function makeDocument(name: string, type = 'image/png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function makeAudio(name = 'recording.webm', type = 'audio/webm') {
  return new File([new Uint8Array([4, 5, 6])], name, { type });
}

function makeOversizedFile(name: string, type: string, bytes: number) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('POST /api/intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines two documents and audio in order with correct labels', async () => {
    vi.mocked(extractDocumentText)
      .mockResolvedValueOnce({ text: '처방전 내용' })
      .mockResolvedValueOnce({ text: '진단서 내용' });
    vi.mocked(transcribeAudio).mockResolvedValueOnce({ text: '환자 발화 내용' });

    const formData = new FormData();
    formData.append('documents', makeDocument('prescription.png'));
    formData.append('documents', makeDocument('diagnosis.pdf', 'application/pdf'));
    formData.append('audio', makeAudio());

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documentTexts).toEqual(['처방전 내용', '진단서 내용']);
    expect(data.recordingText).toBe('환자 발화 내용');
    expect(data.combinedTranscript).toBe(
      '[문서 1]\n처방전 내용\n\n[문서 2]\n진단서 내용\n\n[음성 녹음]\n환자 발화 내용',
    );
  });

  it('returns recordingText null when only documents are submitted', async () => {
    const formData = new FormData();
    formData.append('documents', makeDocument('prescription.png'));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documentTexts).toEqual(['문서 분석 결과']);
    expect(data.recordingText).toBeNull();
    expect(data.combinedTranscript).toBe('[문서 1]\n문서 분석 결과');
  });

  it('handles audio-only submissions', async () => {
    const formData = new FormData();
    formData.append('audio', makeAudio());

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documentTexts).toEqual([]);
    expect(data.recordingText).toBe('녹음 전사 결과');
    expect(data.combinedTranscript).toBe('[음성 녹음]\n녹음 전사 결과');
  });

  it('uses only the first 2 documents when more than 2 are submitted', async () => {
    vi.mocked(extractDocumentText).mockResolvedValue({ text: '문서 분석 결과' });

    const formData = new FormData();
    formData.append('documents', makeDocument('a.png'));
    formData.append('documents', makeDocument('b.png'));
    formData.append('documents', makeDocument('c.png'));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documentTexts).toEqual(['문서 분석 결과', '문서 분석 결과']);
    expect(vi.mocked(extractDocumentText)).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when there are zero inputs', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('파일 또는 녹음이 필요합니다.');
  });

  it('returns 400 for an unsupported document mime type', async () => {
    const formData = new FormData();
    formData.append('documents', makeDocument('notes.txt', 'text/plain'));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('지원하지 않는 파일 형식입니다.');
  });

  it('returns 400 for an unsupported audio mime type', async () => {
    const formData = new FormData();
    formData.append('audio', makeAudio('notes.txt', 'text/plain'));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('지원하지 않는 파일 형식입니다.');
  });

  it('returns 400 when a document exceeds the 10MB size cap', async () => {
    const formData = new FormData();
    formData.append('documents', makeOversizedFile('big.png', 'image/png', 10 * 1024 * 1024 + 1));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('10MB');
    expect(vi.mocked(extractDocumentText)).not.toHaveBeenCalled();
  });

  it('returns 400 when the audio recording exceeds the 25MB size cap', async () => {
    const formData = new FormData();
    formData.append('audio', makeOversizedFile('big.webm', 'audio/webm', 25 * 1024 * 1024 + 1));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('25MB');
    expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
  });

  it('returns 502 when extraction throws', async () => {
    vi.mocked(extractDocumentText).mockRejectedValueOnce(new Error('boom'));

    const formData = new FormData();
    formData.append('documents', makeDocument('prescription.png'));

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('파일을 텍스트로 변환하지 못했습니다.');
  });

  it('returns 502 when transcription throws', async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error('boom'));

    const formData = new FormData();
    formData.append('audio', makeAudio());

    const request = new Request('http://localhost/api/intake', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('파일을 텍스트로 변환하지 못했습니다.');
  });
});
