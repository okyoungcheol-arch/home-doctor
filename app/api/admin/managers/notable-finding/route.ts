import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { findManagerById, findMemberByPhoneInOrganization } from '@/lib/server/organizations/repository';
import { listRecordsForMember } from '@/lib/server/records/repository';
import { guard } from '@/lib/server/http';

// 매니저 자신은 문진 기록을 갖지 않는다(medical_records는 memberId만 참조) — 매니저가 같은 단체의
// 회원으로도 등록돼 있으면(전화번호 일치) 그 회원의 최신 특이사항을 대신 반환하고, 아니면
// isMember: false로 알려준다.
export async function GET(request: Request) {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const managerId = new URL(request.url).searchParams.get('managerId');
  if (!managerId) {
    return NextResponse.json({ error: 'managerId가 필요합니다.' }, { status: 400 });
  }

  const manager = await findManagerById(managerId);
  if (!manager) {
    return NextResponse.json({ error: '해당 매니저를 찾을 수 없습니다.' }, { status: 404 });
  }

  const member = await findMemberByPhoneInOrganization(manager.phoneNumber, manager.organizationId);
  if (!member) {
    return NextResponse.json({ isMember: false, notableFindings: null, recordDate: null });
  }

  const [latestRecord] = await listRecordsForMember(member.id);
  return NextResponse.json({
    isMember: true,
    notableFindings: latestRecord?.notableFindings ?? null,
    recordDate: latestRecord?.recordDate ?? null,
  });
}
