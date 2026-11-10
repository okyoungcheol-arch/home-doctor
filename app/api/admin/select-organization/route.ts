import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { findOrganizationById } from '@/lib/server/organizations/repository';
import { setActingOrganization } from '@/lib/server/auth/session';
import { guard, parseJsonBody } from '@/lib/server/http';

const selectOrganizationSchema = z.object({
  // organizations.id가 uuid 컬럼이라, uuid가 아닌 값으로 조회하면 DB가 예외를 던진다(500) —
  // 형식 오류는 여기서 400으로 먼저 걸러낸다.
  organizationId: z.uuid(),
});

// 관리자가 매니저 권한(회원 등록/선택/문진 저장)으로 행동할 단체를 고른다. 이후 /api/dashboard/*
// 라우트는 이 단체를 매니저의 소속 단체와 동일하게 취급한다.
export async function POST(request: Request) {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = selectOrganizationSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const organization = await findOrganizationById(parsed.data.organizationId);
  if (!organization) {
    return NextResponse.json({ error: '해당 단체를 찾을 수 없습니다.' }, { status: 404 });
  }

  await setActingOrganization(organization.id);

  return NextResponse.json({ success: true });
}
