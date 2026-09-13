import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { findMemberById } from '@/lib/server/organizations/repository';
import { setActiveMember } from '@/lib/server/auth/session';

const selectMemberSchema = z.object({
  memberId: z.string().min(1),
});

export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await requireManager();
  } catch {
    return NextResponse.json({ error: '매니져 권한이 필요합니다.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = selectMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await findMemberById(parsed.data.memberId);
  if (!member || member.organizationId !== viewer.organizationId) {
    return NextResponse.json({ error: '해당 회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  await setActiveMember(member.id);

  return NextResponse.json({ success: true });
}
