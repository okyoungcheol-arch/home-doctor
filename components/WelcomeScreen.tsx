'use client';

import { useState } from 'react';
import Link from 'next/link';
import { InterviewApp } from '@/components/InterviewApp';

// 게스트는 세션이 전혀 없으므로 "손님입장"은 서버 왕복 없이 로컬 상태로만 전환한다.
// 관리자 로그인은 일반 사용자 동선에 노출하지 않는다 — 관리자는 /sign-in을 직접 입력해 접근한다.
export function WelcomeScreen() {
  const [entered, setEntered] = useState(false);

  if (entered) {
    return <InterviewApp canSave={false} />;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">홈 닥터</h1>
      <p className="text-sm text-label-alternative">
        손님으로 입장하면 문진 결과가 저장되지 않습니다. 등록된 회원의 문진을 진행하려면 매니저
        전화번호로 입장해 주세요.
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setEntered(true)}
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white"
        >
          손님입장
        </button>
        <Link
          href="/manager-entry"
          className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
        >
          매니저 전화번호 입장
        </Link>
      </div>
    </main>
  );
}
