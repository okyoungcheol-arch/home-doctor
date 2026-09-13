import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/server/auth/authorize';
import { findMemberInOrganization } from '@/lib/server/organizations/repository';
import { createRecord } from '@/lib/server/records/repository';
import { clearActiveMember } from '@/lib/server/auth/session';
import { guard, parseJsonBody } from '@/lib/server/http';

const createRecordSchema = z.object({
  documentTexts: z.array(z.string()),
  recordingText: z.string().nullable(),
  interviewRecord: z.record(z.string(), z.unknown()),
  diagnosisResult: z.string().min(1),
  precautions: z.string().min(1),
  notableFindings: z.string().nullable(),
  isCritical: z.boolean(),
});

export async function POST(request: Request) {
  const guarded = await guard(requireMember, '저장 권한이 없습니다.', 401);
  if (!guarded.ok) return guarded.response;
  const viewer = guarded.value;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createRecordSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await findMemberInOrganization(viewer.activeMemberId!, viewer.organizationId!);
  if (!member) {
    return NextResponse.json({ error: '회원 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const record = await createRecord({
    memberId: viewer.activeMemberId!,
    organizationId: viewer.organizationId!,
    memberName: member.name,
    memberPhoneNumber: member.phoneNumber,
    documentTexts: parsed.data.documentTexts,
    recordingText: parsed.data.recordingText,
    interviewRecord: parsed.data.interviewRecord,
    diagnosisResult: parsed.data.diagnosisResult,
    precautions: parsed.data.precautions,
    notableFindings: parsed.data.notableFindings,
    isCritical: parsed.data.isCritical,
  });

  // 문진이 저장됐으니 이 세션의 활성 회원 선택을 서버에서 직접 해제한다 — 클라이언트가 별도
  // 요청을 보내는 걸 잊으면(또는 다른 화면에서 저장 흐름을 다시 구현하면) 공용 태블릿에서 다음
  // 문진이 이전 회원 명의로 저장되는 사고로 이어지므로, "저장 성공 시 활성 회원 해제"라는 불변
  // 조건은 저장을 수행하는 이 라우트 자신이 보장한다(클라이언트가 기억해야 하는 후속 호출이 아님).
  await clearActiveMember();

  return NextResponse.json({ record });
}
