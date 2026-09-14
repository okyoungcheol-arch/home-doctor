'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewApp } from '@/components/InterviewApp';
import { formatPhoneNumber, MANAGER_PHONE_STORAGE_KEY } from '@/lib/phone';

async function submitManagerEntry(phoneNumber: string): Promise<Response> {
  return fetch('/api/manager-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
}

// 게스트는 세션이 전혀 없으므로 "손님입장"은 서버 왕복 없이 로컬 상태로만 전환한다.
// 관리자 로그인은 일반 사용자 동선에 노출하지 않는다 — 관리자는 /admin-entry를 직접 입력해 접근한다.
export function WelcomeScreen() {
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 기기에 저장된 번호로 자동 로그인을 시도하는 동안에는 평소 화면(전화번호 입력/손님입장)을
  // 보여주지 않는다 — 자동 로그인이 실패했을 때만 평소 화면으로 넘어간다.
  const [checkingAutoLogin, setCheckingAutoLogin] = useState(true);

  useEffect(() => {
    // 시크릿 모드/스토리지 차단 브라우저에서는 localStorage 접근 자체가 예외를 던질 수 있다 —
    // 이 경우 자동 로그인을 그냥 건너뛰고 평소 화면(전화번호 입력)으로 진행한다.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MANAGER_PHONE_STORAGE_KEY);
    } catch {
      setCheckingAutoLogin(false);
      return;
    }
    if (!saved) {
      setCheckingAutoLogin(false);
      return;
    }
    submitManagerEntry(saved)
      .then((response) => {
        if (response.ok) {
          router.push('/dashboard');
          return;
        }
        // 등록 취소 등으로 더 이상 유효하지 않은 번호면 기기에서 지우고 평소 화면으로 넘어간다.
        localStorage.removeItem(MANAGER_PHONE_STORAGE_KEY);
        setCheckingAutoLogin(false);
      })
      .catch(() => {
        setCheckingAutoLogin(false);
      });
  }, [router]);

  async function handleManagerLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await submitManagerEntry(phoneNumber);
      if (response.ok) {
        // 로그인 자체는 성공했으므로, 스토리지 저장이 실패하더라도(시크릿 모드 등) 이동은
        // 그대로 진행한다 — 다음에 다시 로그인할 때 자동 로그인만 못 받을 뿐이다.
        try {
          localStorage.setItem(MANAGER_PHONE_STORAGE_KEY, phoneNumber);
        } catch {
          // ignore
        }
        router.push('/dashboard');
        return;
      }
      const data = await response.json().catch(() => null);
      setError(data?.error ?? '입장에 실패했습니다.');
      setSubmitting(false);
    } catch {
      setError('입장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  if (entered) {
    return <InterviewApp canSave={false} />;
  }

  if (checkingAutoLogin) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-6">
        <p className="text-sm text-label-alternative">자동 로그인 확인 중...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">홈 닥터</h1>
      <p className="text-sm text-label-alternative">
        손님으로 입장하면 문진 결과가 저장되지 않습니다. 등록된 회원의 문진을 진행하려면 매니저
        전화번호로 로그인해 주세요.
      </p>

      <form
        onSubmit={handleManagerLogin}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          매니저 전화번호
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
            placeholder="010-1234-5678"
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white disabled:opacity-50"
        >
          매니저 로그인
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>

      <button
        type="button"
        onClick={() => setEntered(true)}
        className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
      >
        손님입장
      </button>
    </main>
  );
}
