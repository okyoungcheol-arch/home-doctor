import Link from 'next/link';

export function WelcomeScreen() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">홈 닥터</h1>
      <p className="text-sm text-label-alternative">
        로그인하면 문진 결과가 저장되어 나중에 다시 확인할 수 있습니다.
      </p>

      <div className="flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white"
        >
          손님입장
        </Link>
        <Link
          href="/sign-up"
          className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
        >
          회원가입
        </Link>
      </div>
    </main>
  );
}
