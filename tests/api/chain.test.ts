import { describe, it, expect, vi } from 'vitest';

// This test mocks only the `ai` package's `transcribe`/`generateObject` functions (same
// pattern as tests/agents/*.test.ts and tests/api/*.test.ts) and drives the real route
// handlers in sequence, feeding each stage's real HTTP response body into the next
// stage's request body exactly as app/page.tsx does. The goal is to catch shape-mismatch
// bugs across stage boundaries that per-route tests (which mock away their own lib/ call)
// cannot see. Enters via /api/intake (the active initial-upload endpoint) rather than the
// deprecated-for-initial-upload /api/transcribe — see tests/api/manager-save-chain.test.ts
// for the separate manager-entry -> select-member -> records save chain this one doesn't
// cover (this test exercises the guest path, which never reaches a save).

const { mockGenerateObject, mockTranscribe } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockTranscribe: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: mockGenerateObject, transcribe: mockTranscribe };
});

vi.mock('@/lib/server/auth/patientProfile', () => ({
  getPatientProfile: vi.fn(async () => null),
}));

// The synthesize route now looks up the caller's viewer/history (manager-only feature);
// this chain test exercises the guest path, so stub it out rather than pulling in the
// real Clerk/session/DB modules (which don't work in this test environment).
vi.mock('@/lib/server/auth/authorize', () => ({
  getViewer: vi.fn(async () => ({ role: 'guest', userId: null, organizationId: null })),
}));

import { POST as intakePost } from '@/app/api/intake/route';
import { POST as triagePost } from '@/app/api/triage/route';
import { POST as specialistsPost } from '@/app/api/specialists/route';
import { POST as interviewPost } from '@/app/api/interview/route';
import { POST as synthesizePost } from '@/app/api/synthesize/route';
import { mergeQuestions } from '@/lib/interview/mergeQuestions';
import type { SpecialistOpinion } from '@/lib/ai/schemas';

describe('full intake -> triage -> specialists -> interview -> synthesize chain', () => {
  it('composes each real route response directly into the next request without manual reshaping', async () => {
    // ---- 1) intake (the active initial-upload endpoint, replacing /api/transcribe) ----
    mockTranscribe.mockResolvedValueOnce({
      text: '기침이 3주 동안 계속되고 가슴이 답답합니다.',
      language: 'ko',
      durationInSeconds: 12,
    });

    const audioFormData = new FormData();
    audioFormData.append('audio', new File([new Uint8Array([1, 2, 3])], 'call.webm', { type: 'audio/webm' }));
    const intakeResponse = await intakePost(
      new Request('http://localhost/api/intake', { method: 'POST', body: audioFormData }),
    );
    expect(intakeResponse.status).toBe(200);
    const intakeData = await intakeResponse.json();
    // No documents were submitted, so combinedTranscript is exactly the recording section.
    const transcript: string = intakeData.combinedTranscript;
    expect(transcript).toBe('[음성 녹음]\n기침이 3주 동안 계속되고 가슴이 답답합니다.');

    // ---- 2) triage ----
    mockGenerateObject.mockImplementationOnce(async () => ({
      object: {
        specialties: [
          { id: 'pulmonology', reason: '기침과 흉부 답답함 언급' },
          { id: 'cardiology', reason: '흉부 답답함 언급' },
        ],
      },
    }));

    const triageResponse = await triagePost(
      new Request('http://localhost/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      }),
    );
    expect(triageResponse.status).toBe(200);
    const triageData = await triageResponse.json();
    expect(triageData.specialties).toHaveLength(2);

    // ---- 3) specialists (initial parallel analysis) ----
    mockGenerateObject.mockImplementationOnce(async () => ({
      object: {
        suspectedConditions: [{ name: '천식', confidence: 0.5, rationale: '3주간 지속된 마른기침' }],
        followUpQuestions: [
          { question: '운동 시 숨이 차나요?', options: ['네, 심하게 차요', '약간 차요', '아니요'], reason: '천식 여부 확인' },
        ],
      },
    }));
    mockGenerateObject.mockImplementationOnce(async () => ({
      object: {
        suspectedConditions: [{ name: '협심증', confidence: 0.3, rationale: '흉부 답답함 언급' }],
        followUpQuestions: [],
      },
    }));

    const specialistsResponse = await specialistsPost(
      new Request('http://localhost/api/specialists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The only transformation applied to the triage response is extracting the `id`
        // field for each chosen specialty — the same adapter app/page.tsx performs.
        body: JSON.stringify({
          transcript,
          specialtyIds: triageData.specialties.map((s: { id: string }) => s.id),
        }),
      }),
    );
    expect(specialistsResponse.status).toBe(200);
    const specialistsData = await specialistsResponse.json();
    const opinions: SpecialistOpinion[] = specialistsData.opinions;
    expect(opinions).toHaveLength(2);

    // Build the follow-up question queue exactly as app/page.tsx does.
    const queue = mergeQuestions(opinions);
    expect(queue.length).toBeGreaterThan(0);
    const currentQuestion = queue[0];
    const specialtyId = currentQuestion.askedBy[0].specialtyId;
    const priorOpinion = opinions.find((o) => o.specialtyId === specialtyId);
    expect(priorOpinion).toBeDefined();

    // ---- 4) interview (one follow-up round) ----
    mockGenerateObject.mockImplementationOnce(async () => ({
      object: {
        suspectedConditions: [{ name: '천식', confidence: 0.75, rationale: '운동 시 호흡곤란 확인됨' }],
        followUpQuestions: [],
      },
    }));

    const interviewResponse = await interviewPost(
      new Request('http://localhost/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialtyId,
          transcript,
          priorOpinion,
          question: currentQuestion.question,
          answerText: '네, 계단을 오르면 숨이 찹니다.',
        }),
      }),
    );
    expect(interviewResponse.status).toBe(200);
    const interviewData = await interviewResponse.json();

    // The route's `opinion` already carries specialtyId/specialtyName (looked up
    // server-side from the catalog, not from the model), so it satisfies
    // SpecialistOpinion as-is — no manual reshaping needed to feed it back into the
    // opinions array.
    const updatedOpinion: SpecialistOpinion = interviewData.opinion;
    expect(updatedOpinion.specialtyId).toBe(priorOpinion!.specialtyId);
    expect(updatedOpinion.specialtyName).toBe(priorOpinion!.specialtyName);

    const updatedOpinions = opinions.map((o) => (o.specialtyId === specialtyId ? updatedOpinion : o));

    // ---- 5) synthesize ----
    mockGenerateObject.mockImplementationOnce(async () => ({
      object: {
        overallImpression: '호흡기 증상이 우세하며 천식 가능성이 있습니다.',
        topDifferentials: [{ condition: '천식', supportingSpecialties: ['호흡기내과'], confidence: 0.7 }],
        recommendedActions: ['호흡기내과 방문 및 폐기능 검사 권장'],
        redFlags: [],
      },
    }));

    const synthesizeResponse = await synthesizePost(
      new Request('http://localhost/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opinions: updatedOpinions }),
      }),
    );
    expect(synthesizeResponse.status).toBe(200);
    const synthesizeData = await synthesizeResponse.json();
    expect(synthesizeData.report.overallImpression).toContain('천식');
    expect(synthesizeData.report.topDifferentials[0].condition).toBe('천식');

    // Every generateObject call in the chain was consumed exactly once, in order.
    expect(mockGenerateObject).toHaveBeenCalledTimes(5);
  });
});
