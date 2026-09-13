import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createManagerSession } from '@/lib/server/auth/session';
import { findManagerByPhoneNumber } from '@/lib/server/organizations/repository';

const managerEntrySchema = z.object({
  phoneNumber: z.string().min(1),
});

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = managerEntrySchema.safeParse(body);
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
