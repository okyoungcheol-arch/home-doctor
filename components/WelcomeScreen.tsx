'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">다중 전문의 AI 문진</h1>
      <p className="text-sm text-label-alternative">
        로그인하면 문진 결과가 저장되어 나중에 다시 확인할 수 있습니다. 로그인 없이도 게스트로 바로
        이용할 수 있지만, 이 경우 결과는 저장되지 않습니다.
      </p>

      <div className="flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white"
        >
          로그인
        </Link>
        <Link
          href="/sign-up"
          className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
        >
          회원가입
        </Link>
        <button
          type="button"
          onClick={() => router.push('/guest')}
          className="rounded-8 bg-fill-normal px-4 py-2 text-sm"
        >
          게스트로 계속하기
        </button>
      </div>
    </main>
  );
}
