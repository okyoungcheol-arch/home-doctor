'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import type { QueuedQuestion } from '@/lib/interview/mergeQuestions';

export type AnswerAttachment = { data: string; mediaType: string; filename?: string };

type InterviewChatProps = {
  currentQuestion: QueuedQuestion | null;
  onAnswer: (answerText: string, attachment?: AnswerAttachment) => Promise<void>;
};

export function InterviewChat({ currentQuestion, onAnswer }: InterviewChatProps) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<AnswerAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  if (!currentQuestion) {
    return <p className="text-sm text-label-alternative">모든 문진 질문에 답변했습니다.</p>;
  }

  async function startRecording() {
    setErrorMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage('마이크 접근 권한이 필요합니다.');
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'answer.webm');
      try {
        const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('음성 인식에 실패했습니다.');
        const data = await response.json();
        setText((prev) => (prev ? `${prev} ${data.text}` : data.text));
      } catch {
        setErrorMessage('음성 인식에 실패했습니다. 다시 시도해주세요.');
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setAttachment({ data: base64, mediaType: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!text.trim() && !attachment) return;
    setIsSubmitting(true);
    try {
      await onAnswer(text.trim(), attachment ?? undefined);
      setText('');
      setAttachment(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <div>
        <span className="text-xs font-medium text-primary-normal">
          {currentQuestion.askedBy.map((a) => a.specialtyName).join(', ')} 문진
        </span>
        <p className="mt-1 text-base font-medium">{currentQuestion.question}</p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="답변을 입력하세요"
        rows={3}
        className="rounded-8 border border-line-normal p-2 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm"
        >
          {isRecording ? '녹음 중지' : '음성으로 답변'}
        </button>

        <label className="cursor-pointer rounded-8 bg-fill-normal px-3 py-1.5 text-sm">
          사진/파일 첨부
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
        </label>

        {attachment && <span className="text-xs text-label-alternative">{attachment.filename} 첨부됨</span>}
      </div>

      {errorMessage && <p className="text-sm text-status-negative">{errorMessage}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || (!text.trim() && !attachment)}
        className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
      >
        답변 제출
      </button>
    </div>
  );
}
