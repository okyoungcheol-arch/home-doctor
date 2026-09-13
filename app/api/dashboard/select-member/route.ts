import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { findMemberInOrganization } from '@/lib/server/organizations/repository';
import { setActiveMember } from '@/lib/server/auth/session';
import { guard, parseJsonBody } from '@/lib/server/http';

const selectMemberSchema = z.object({
  memberId: z.string().min(1),
});

export async function POST(request: Request) {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = selectMemberSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await findMemberInOrganization(parsed.data.memberId, guarded.value.organizationId!);
  if (!member) {
    return NextResponse.json({ error: '해당 회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  await setActiveMember(member.id);

  return NextResponse.json({ success: true });
}
