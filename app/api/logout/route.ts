import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/server/auth/session';

/** 현재 로그인(매니저/관리자)을 완전히 종료한다 — "다른 계정으로 로그인" 버튼이 호출한다. */
export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}
