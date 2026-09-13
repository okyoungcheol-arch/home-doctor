import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createManagerSession } from '@/lib/server/auth/session';
import { findManagerByPhoneNumber } from '@/lib/server/organizations/repository';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { parseJsonBody } from '@/lib/server/http';

const managerEntrySchema = z.object({
  phoneNumber: z.string().min(1),
});

// 전화번호가 유일한 자격 증명이므로(비밀번호/OTP 없음) 스크립트로 번호를 무차별 대입하는 것을
// 최소한이라도 막는다 — IP당 5분에 10회.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(`manager-entry:${clientIp}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = managerEntrySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const manager = await findManagerByPhoneNumber(parsed.data.phoneNumber);
  if (!manager) {
    return NextResponse.json({ error: '등록되지 않은 전화번호입니다.' }, { status: 404 });
  }

  await createManagerSession(manager.id, manager.organizationId);

  return NextResponse.json({ success: true });
}
