'use client';

import Link from 'next/link';

export function AdminNav() {
  async function handleSwitchAccount() {
    try {
      // 관리자 로그인은 매니저처럼 localStorage 자동 로그인 값을 쓰지 않으므로(전화번호를 매번
      // 입력) 세션 쿠키만 지우면 된다.
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore — 로그아웃 요청이 실패해도 이동 자체는 진행한다
    }
    window.location.href = '/';
  }

  return (
    <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-6 text-sm">
      <div className="flex gap-4">
        <Link href="/admin" className="font-medium hover:text-primary-normal">
          단체 생성
        </Link>
        <Link href="/admin/managers" className="font-medium hover:text-primary-normal">
          매니저 등록
        </Link>
        <Link href="/admin/status" className="font-medium hover:text-primary-normal">
          단체별 조회
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
