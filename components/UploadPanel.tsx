'use client';

import { useRef, useState, type ChangeEvent } from 'react';

type IntakeResult = {
  documentTexts: string[];
  recordingText: string | null;
  combinedTranscript: string;
};

type UploadPanelProps = {
  onComplete: (result: IntakeResult) => void;
};

const MAX_DOCUMENTS = 2;

export function UploadPanel({ onComplete }: UploadPanelProps) {
  const [documents, setDocuments] = useState<File[]>([]);
  const [stagedAudio, setStagedAudio] = useState<Blob | null>(null);
  const [truncationNotice, setTruncationNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_DOCUMENTS) {
      setTruncationNotice('최대 2개까지 첨부할 수 있어 앞의 2개만 선택되었습니다.');
    } else {
      setTruncationNotice(null);
    }
    setDocuments(files.slice(0, MAX_DOCUMENTS));
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
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setStagedAudio(blob);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function handleSubmit() {
    setStatus('submitting');
    setErrorMessage(null);

    const formData = new FormData();
    documents.forEach((file) => formData.append('documents', file, file.name));
    if (stagedAudio) formData.append('audio', stagedAudio, 'recording.webm');

    try {
      const response = await fetch('/api/intake', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '분석 요청이 실패했습니다.');
      onComplete({
        documentTexts: data.documentTexts,
        recordingText: data.recordingText,
        combinedTranscript: data.combinedTranscript,
      });
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }

  const busy = status === 'submitting' || isRecording;
  const canSubmit = (documents.length > 0 || stagedAudio !== null) && status !== 'submitting';

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">파일 업로드 또는 마이크 녹음</h2>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          disabled={busy}
          onChange={handleDocumentChange}
          className="text-sm disabled:opacity-50"
        />

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={status === 'submitting'}
          className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {isRecording ? '녹음 중지' : '마이크로 녹음'}
        </button>
      </div>

      {truncationNotice && <p className="text-sm text-label-alternative">{truncationNotice}</p>}

      <p className="text-sm text-label-alternative">
        첨부된 문서: {documents.length}개 · 녹음: {stagedAudio ? '있음' : '없음'}
      </p>

      {isRecording && <p className="text-sm text-label-alternative">녹음 중입니다...</p>}
      {status === 'submitting' && <p className="text-sm text-label-alternative">분석을 준비하는 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">{errorMessage}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
      >
        분석 시작
      </button>
    </div>
  );
}
