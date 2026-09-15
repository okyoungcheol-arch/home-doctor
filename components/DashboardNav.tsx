'use client';

import Link from 'next/link';
import { MANAGER_PHONE_STORAGE_KEY } from '@/lib/phone';

export function DashboardNav() {
  async function handleSwitchAccount() {
    try {
      localStorage.removeItem(MANAGER_PHONE_STORAGE_KEY);
    } catch {
      // ignore — 스토리지 접근이 막혀 있어도 이동 자체는 진행한다
    }
    try {
      // 서버 세션 쿠키까지 지워야 한다 — 안 지우면 '/'로 이동해도 매니저 세션이 남아 있어
      // 같은 계정의 /dashboard로 곧바로 되돌아간다.
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore — 로그아웃 요청이 실패해도 이동 자체는 진행한다
    }
    window.location.href = '/';
  }

  return (
    <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-6 text-sm">
      <div className="flex gap-4">
        <Link href="/dashboard" className="font-medium hover:text-primary-normal">
          문진 시작
        </Link>
        <Link href="/dashboard/register" className="font-medium hover:text-primary-normal">
          회원 등록
        </Link>
      </div>
      <button
        type="button"
        onClick={handleSwitchAccount}
        className="text-label-alternative underline hover:text-primary-normal"
      >
        다른 계정으로 로그인
      </button>
    </nav>
  );
}
