import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { findMemberById } from '@/lib/server/organizations/repository';
import { listRecordsForMember } from '@/lib/server/records/repository';
import { guard } from '@/lib/server/http';

// 회원의 가장 최근 문진 1건에서 특이사항만 반환한다 — listRecordsForMember가 이미 문진일
// 내림차순으로 정렬해 반환하므로 첫 번째 항목이 최신 기록이다.
export async function GET(request: Request) {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const memberId = new URL(request.url).searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json({ error: 'memberId가 필요합니다.' }, { status: 400 });
  }

  const member = await findMemberById(memberId);
  if (!member) {
    return NextResponse.json({ error: '해당 회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  const [latestRecord] = await listRecordsForMember(memberId);
  return NextResponse.json({
    notableFindings: latestRecord?.notableFindings ?? null,
    recordDate: latestRecord?.recordDate ?? null,
  });
}
