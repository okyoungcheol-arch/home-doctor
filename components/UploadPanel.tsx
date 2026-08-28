'use client';

import { useRef, useState, type ChangeEvent } from 'react';

type UploadPanelProps = {
  onComplete: (transcript: string) => void;
};

export function UploadPanel({ onComplete }: UploadPanelProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function transcribeAndComplete(audio: File | Blob, filename: string) {
    setStatus('uploading');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('audio', audio, filename);

    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('전사 요청이 실패했습니다.');
      const data = await response.json();
      onComplete(data.text);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    transcribeAndComplete(file, file.name);
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
      transcribeAndComplete(blob, 'recording.webm');
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  const busy = status === 'uploading' || isRecording;

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">통화 녹음 업로드 또는 마이크 녹음</h2>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={handleFileChange}
          className="text-sm disabled:opacity-50"
        />

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={status === 'uploading'}
          className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {isRecording ? '녹음 중지' : '마이크로 녹음'}
        </button>
      </div>

      {isRecording && <p className="text-sm text-label-alternative">녹음 중입니다...</p>}
      {status === 'uploading' && <p className="text-sm text-label-alternative">전사 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">{errorMessage}</p>}
    </div>
  );
}
