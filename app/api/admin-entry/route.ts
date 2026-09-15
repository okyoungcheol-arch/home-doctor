import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSession } from '@/lib/server/auth/session';
import { findAdminByPhoneNumber } from '@/lib/server/admins/repository';
import { verifyPin } from '@/lib/server/admins/pin';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { parseJsonBody } from '@/lib/server/http';

const adminEntrySchema = z.object({
  phoneNumber: z.string().min(1),
  // 대부분의 관리자 계정에는 PIN이 없으므로 선택 필드다 — 아래에서 admin.pinCode가 실제로
  // 설정된 계정에 한해서만 필수로 검증한다.
  pin: z.string().optional(),
});

// 전화번호가 유일한 자격 증명이므로(비밀번호/OTP 없음) 스크립트로 번호를 무차별 대입하는 것을
// 최소한이라도 막는다 — IP당 5분에 10회.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(`admin-entry:${clientIp}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = adminEntrySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const admin = await findAdminByPhoneNumber(parsed.data.phoneNumber);
  if (!admin) {
    return NextResponse.json({ error: '등록되지 않은 전화번호입니다.' }, { status: 404 });
  }

  // pinCode가 설정된 계정만 PIN을 요구한다 — 나머지 관리자는 기존과 동일하게 전화번호만으로
  // 로그인한다(이 앱의 의도된 저보안 기본값, 이 계정만의 선택적 예외).
  if (admin.pinCode && (!parsed.data.pin || !verifyPin(parsed.data.pin, admin.pinCode))) {
    return NextResponse.json({ error: 'PIN이 올바르지 않습니다.' }, { status: 401 });
  }

  await createAdminSession(admin.id);

  return NextResponse.json({ success: true });
}
