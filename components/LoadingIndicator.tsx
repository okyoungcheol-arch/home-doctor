'use client';

import { useEffect, useState } from 'react';

// Mounted only while active, so its internal counter naturally starts fresh
// at 0 each time (no parent-managed reset state needed).
export function LoadingIndicator({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-label-alternative">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-line-normal border-t-primary-normal"
      />
      <span>
        {label} ({seconds}초 경과 — AI 모델 응답에 최대 1분 정도 걸릴 수 있습니다)
      </span>
    </div>
  );
}
