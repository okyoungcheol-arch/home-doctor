'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { formatPhoneNumber } from '@/lib/phone';

type PhoneEntryFormProps = {
  title: string;
  description: string;
  apiPath: string;
  redirectPath: string;
};

export function PhoneEntryForm({ title, description, apiPath, redirectPath }: PhoneEntryFormProps) {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  // 대부분의 관리자 계정에는 PIN이 없다 — 비워두면 서버가 무시하고 전화번호만으로 로그인시킨다.
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, pin: pin || undefined }),
      });

      if (response.ok) {
        router.push(redirectPath);
        return;
      }

      if (response.status === 404 || response.status === 401) {
        const data = await response.json();
        setError(data.error ?? '입장에 실패했습니다.');
      } else {
        setError('입장에 실패했습니다.');
      }
      setSubmitting(false);
    } catch {
      setError('입장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-label-alternative">{description}</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          전화번호
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
            placeholder="010-1234-5678"
            required
            className="w-full rounded-8 border border-line-normal p-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          PIN (설정된 경우에만 입력)
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="선택 입력"
            className="w-full rounded-8 border border-line-normal p-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
        >
          입장
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
