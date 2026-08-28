'use client';

import { useState } from 'react';
import { UploadPanel } from '@/components/UploadPanel';
import { InterviewChat, type AnswerAttachment } from '@/components/InterviewChat';
import { SpecialistCard } from '@/components/SpecialistCard';
import { SynthesisReport } from '@/components/SynthesisReport';
import { mergeQuestions, type QueuedQuestion } from '@/lib/interview/mergeQuestions';
import type { SpecialistOpinion, SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';

type Stage = 'upload' | 'analyzing' | 'interview' | 'synthesizing' | 'report';

export default function Home() {
  const [stage, setStage] = useState<Stage>('upload');
  const [transcript, setTranscript] = useState('');
  const [opinions, setOpinions] = useState<SpecialistOpinion[]>([]);
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [report, setReport] = useState<SynthesisReportType | null>(null);
  const [emergencyFlags, setEmergencyFlags] = useState<string[]>([]);

  async function handleTranscribed(text: string) {
    setTranscript(text);
    setStage('analyzing');

    const triageResponse = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text }),
    });
    const triageData = await triageResponse.json();
    setEmergencyFlags(triageData.emergency?.matchedFlags ?? []);

    const specialistsResponse = await fetch('/api/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: text,
        specialtyIds: triageData.specialties.map((s: { id: string }) => s.id),
      }),
    });
    const specialistsData = await specialistsResponse.json();
    const initialOpinions: SpecialistOpinion[] = specialistsData.opinions;
    const initialQueue = mergeQuestions(initialOpinions);

    setOpinions(initialOpinions);
    setQueue(initialQueue);

    if (initialQueue.length === 0) {
      await finishInterview(initialOpinions);
    } else {
      setStage('interview');
    }
  }

  async function handleAnswer(answerText: string, attachment?: AnswerAttachment) {
    const current = queue[0];
    if (!current) return;

    const specialtyId = current.askedBy[0].specialtyId;
    const priorOpinion = opinions.find((o) => o.specialtyId === specialtyId);
    if (!priorOpinion) return;

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
    const data = await response.json();

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

    const remainingQueue = queue.slice(1);
    const freshQuestions = mergeQuestions([
      {
        specialtyId: updatedOpinion.specialtyId,
        specialtyName: updatedOpinion.specialtyName,
        followUpQuestions: updatedOpinion.followUpQuestions,
      },
    ]).filter((nq) => !remainingQueue.some((rq) => rq.question === nq.question));

    const nextQueue = [...remainingQueue, ...freshQuestions];
    setQueue(nextQueue);

    if (nextQueue.length === 0) {
      await finishInterview(updatedOpinions);
    }
  }

  async function finishInterview(finalOpinions: SpecialistOpinion[]) {
    setStage('synthesizing');
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opinions: finalOpinions }),
    });
    const data = await response.json();
    setReport(data.report);
    setStage('report');
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">다중 전문의 AI 문진</h1>

      {emergencyFlags.length > 0 && (
        <div className="rounded-12 bg-accent-red-bg p-4 text-sm font-medium text-status-negative">
          응급 신호가 감지되었습니다: {emergencyFlags.join(', ')}. 즉시 119 또는 응급실을 방문하세요.
        </div>
      )}

      {stage === 'upload' && <UploadPanel onComplete={handleTranscribed} />}
      {stage === 'analyzing' && <p className="text-sm text-label-alternative">전문의를 소집하는 중입니다...</p>}

      {stage === 'interview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <InterviewChat currentQuestion={queue[0] ?? null} onAnswer={handleAnswer} />
        </>
      )}

      {stage === 'synthesizing' && <p className="text-sm text-label-alternative">종합 소견을 작성하는 중입니다...</p>}

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
