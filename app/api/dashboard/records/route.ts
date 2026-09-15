import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { findMemberInOrganization } from '@/lib/server/organizations/repository';
import { listRecordsForMember } from '@/lib/server/records/repository';
import { guard } from '@/lib/server/http';

// 소속단체 전체 기록 조회는 더 이상 지원하지 않는다 — 매니저는 회원을 선택("기록 보기")해야만
// 그 회원의 기록을 볼 수 있다(회원 선택 화면에서 다른 회원의 기록이 함께 노출되면 안 되므로).
export async function GET(request: Request) {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const memberId = new URL(request.url).searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json({ error: 'memberId가 필요합니다.' }, { status: 400 });
  }

  const member = await findMemberInOrganization(memberId, guarded.value.organizationId!);
  if (!member) {
    return NextResponse.json({ error: '해당 회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  const records = await listRecordsForMember(memberId);
  return NextResponse.json({ records });
}
