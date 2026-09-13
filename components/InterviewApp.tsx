'use client';

import { useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { UploadPanel } from '@/components/UploadPanel';
import { InterviewChat, type AnswerAttachment } from '@/components/InterviewChat';
import { SpecialistCard } from '@/components/SpecialistCard';
import { SynthesisReport } from '@/components/SynthesisReport';
import { SpecialtySelector, type TriageSpecialty } from '@/components/SpecialtySelector';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { EmergencyBanner } from '@/components/EmergencyBanner';
import { mergeQuestions, normalize, isSimilar, type QueuedQuestion } from '@/lib/interview/mergeQuestions';
import type { SpecialistOpinion, SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';

type Stage =
  | 'upload'
  | 'triaging'
  | 'selecting-specialties'
  | 'consulting'
  | 'interview'
  | 'synthesizing'
  | 'report';

type QaLogEntry = { question: string; answer: string };

// Hard cap on total questions asked in one interview, so a model that keeps re-emitting
// follow-up questions (even after dedup) cannot keep the interview loop running forever.
const MAX_TOTAL_QUESTIONS = 15;

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.error === 'string') return data.error;
  } catch {
    // response body wasn't JSON or didn't have an `error` field; fall through to generic message
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

export function InterviewApp() {
  const { user } = useUser();
  const [stage, setStage] = useState<Stage>('upload');
  const [transcript, setTranscript] = useState('');
  const [documentTexts, setDocumentTexts] = useState<string[]>([]);
  const [recordingText, setRecordingText] = useState<string | null>(null);
  const [triageSpecialties, setTriageSpecialties] = useState<TriageSpecialty[]>([]);
  const [opinions, setOpinions] = useState<SpecialistOpinion[]>([]);
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([]);
  const [qaLog, setQaLog] = useState<QaLogEntry[]>([]);
  const [report, setReport] = useState<SynthesisReportType | null>(null);
  const [emergencyFlags, setEmergencyFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  // Bumped by handleReset so any async handler still in flight (fetches can take up to
  // maxDuration = 60s) can tell its own session has been abandoned and skip its setState calls.
  const sessionIdRef = useRef(0);

  async function handleIntakeComplete(result: {
    documentTexts: string[];
    recordingText: string | null;
    combinedTranscript: string;
  }) {
    setError(null);
    setTranscript(result.combinedTranscript);
    setDocumentTexts(result.documentTexts);
    setRecordingText(result.recordingText);
    setAnsweredQuestions([]);
    setQaLog([]);
    setStage('triaging');
    const sessionId = sessionIdRef.current;

    try {
      const triageResponse = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: result.combinedTranscript }),
      });
      if (!triageResponse.ok) throw new Error(await parseErrorMessage(triageResponse));
      const triageData = await triageResponse.json();
      if (sessionIdRef.current !== sessionId) return;

      setEmergencyFlags(triageData.emergency?.matchedFlags ?? []);
      setTriageSpecialties(triageData.specialties);
      setStage('selecting-specialties');
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function handleConfirmSpecialties(selectedIds: string[]) {
    if (selectedIds.length === 0) return; // SpecialtySelector already disables confirm at 0; defense-in-depth only

    setStage('consulting');
    const sessionId = sessionIdRef.current;

    try {
      const specialistsResponse = await fetch('/api/specialists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, specialtyIds: selectedIds }),
      });
      if (!specialistsResponse.ok) throw new Error(await parseErrorMessage(specialistsResponse));
      const specialistsData = await specialistsResponse.json();
      if (sessionIdRef.current !== sessionId) return;

      const initialOpinions: SpecialistOpinion[] = specialistsData.opinions;
      const initialQueue = mergeQuestions(initialOpinions);

      setOpinions(initialOpinions);
      setQueue(initialQueue);

      if (initialQueue.length === 0) {
        await finishInterview(initialOpinions, sessionId);
      } else {
        setStage('interview');
      }
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function handleAnswer(answerText: string, attachment?: AnswerAttachment) {
    const current = queue[0];
    if (!current) return;

    const specialtyId = current.askedBy[0].specialtyId;
    const priorOpinion = opinions.find((o) => o.specialtyId === specialtyId);
    if (!priorOpinion) return;
    const sessionId = sessionIdRef.current;

    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialtyId,
          transcript,
          priorOpinion,
          question: current.question,
          answerText,
          attachment,
        }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      if (sessionIdRef.current !== sessionId) return;

      if (data.emergency?.matchedFlags?.length) {
        setEmergencyFlags((prev) => Array.from(new Set([...prev, ...data.emergency.matchedFlags])));
      }

      const updatedOpinion: SpecialistOpinion = {
        ...data.opinion,
        specialtyId: priorOpinion.specialtyId,
        specialtyName: priorOpinion.specialtyName,
      };

      const updatedOpinions = opinions.map((o) => (o.specialtyId === specialtyId ? updatedOpinion : o));
      setOpinions(updatedOpinions);

      setQaLog((prev) => [...prev, { question: current.question, answer: answerText }]);

      // The question just answered counts toward the total, whether or not the model echoes
      // it back as a "new" follow-up question.
      const updatedAnswered = [...answeredQuestions, normalize(current.question)];
      setAnsweredQuestions(updatedAnswered);

      const remainingQueue = queue.slice(1);
      const freshQuestions = mergeQuestions([
        {
          specialtyId: updatedOpinion.specialtyId,
          specialtyName: updatedOpinion.specialtyName,
          followUpQuestions: updatedOpinion.followUpQuestions,
        },
      ]).filter((nq) => {
        const nqNormalized = normalize(nq.question);
        const alreadyAnswered = updatedAnswered.some((aq) => isSimilar(aq, nqNormalized));
        const alreadyQueued = remainingQueue.some((rq) => isSimilar(normalize(rq.question), nqNormalized));
        return !alreadyAnswered && !alreadyQueued;
      });

      const nextQueue = [...remainingQueue, ...freshQuestions];

      if (nextQueue.length === 0 || updatedAnswered.length >= MAX_TOTAL_QUESTIONS) {
        setQueue([]);
        await finishInterview(updatedOpinions, sessionId);
      } else {
        setQueue(nextQueue);
      }
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function saveRecord(finalOpinions: SpecialistOpinion[], finalReport: SynthesisReportType) {
    try {
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: (user?.unsafeMetadata?.phoneNumber as string | undefined) ?? '',
          prescriptionText: documentTexts.length > 0 ? documentTexts.join('\n\n') : null,
          recordingText: recordingText,
          interviewRecord: { qaLog, opinions: finalOpinions, report: finalReport },
          isCritical: finalReport.redFlags.length > 0,
        }),
      });
    } catch (err) {
      console.error('의료정보 저장 실패', err);
      setSaveWarning('문진 결과를 저장하지 못했습니다. 화면에 표시된 결과는 그대로 확인하실 수 있습니다.');
    }
  }

  async function finishInterview(finalOpinions: SpecialistOpinion[], sessionId: number) {
    setStage('synthesizing');
    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opinions: finalOpinions }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      if (sessionIdRef.current !== sessionId) return;
      setReport(data.report);
      setStage('report');

      await saveRecord(finalOpinions, data.report);
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  function handleReset() {
    sessionIdRef.current += 1; // must run first — invalidates any in-flight handler's next guard check
    setStage('upload');
    setTranscript('');
    setDocumentTexts([]);
    setRecordingText(null);
    setTriageSpecialties([]);
    setOpinions([]);
    setQueue([]);
    setAnsweredQuestions([]);
    setQaLog([]);
    setReport(null);
    setEmergencyFlags([]);
    setError(null);
    setSaveWarning(null);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">홈 닥터</h1>
        {stage !== 'upload' && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm"
          >
            처음으로
          </button>
        )}
      </div>

      {error && <p className="text-sm text-status-negative">{error}</p>}
      {saveWarning && <p className="text-sm text-status-cautionary">{saveWarning}</p>}

      <EmergencyBanner flags={emergencyFlags} />

      {stage === 'upload' && <UploadPanel onComplete={handleIntakeComplete} />}
      {stage === 'triaging' && <LoadingIndicator label="증상을 분석해 관련 전문분야를 찾는 중입니다..." />}

      {stage === 'selecting-specialties' && (
        <SpecialtySelector specialties={triageSpecialties} onConfirm={handleConfirmSpecialties} />
      )}

      {stage === 'consulting' && <LoadingIndicator label="전문의를 소집하는 중입니다..." />}

      {stage === 'interview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <InterviewChat key={queue[0]?.id ?? 'done'} currentQuestion={queue[0] ?? null} onAnswer={handleAnswer} />
        </>
      )}

      {stage === 'synthesizing' && <LoadingIndicator label="종합 소견을 작성하는 중입니다..." />}

      {stage === 'report' && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <SynthesisReport report={report} />
        </>
      )}
    </main>
  );
}
