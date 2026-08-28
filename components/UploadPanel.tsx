'use client';

import { useState, type ChangeEvent } from 'react';

type UploadPanelProps = {
  onComplete: (transcript: string) => void;
};

export function UploadPanel({ onComplete }: UploadPanelProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('audio', file);

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

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">통화 녹음 파일 업로드</h2>
      <input
        type="file"
        accept="audio/*"
        disabled={status === 'uploading'}
        onChange={handleFileChange}
        className="text-sm"
      />
      {status === 'uploading' && <p className="text-sm text-label-alternative">전사 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">{errorMessage}</p>}
    </div>
  );
}
