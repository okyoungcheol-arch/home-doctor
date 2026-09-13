import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/server/auth/authorize';
import { findMemberById } from '@/lib/server/organizations/repository';
import { createRecord } from '@/lib/server/records/repository';

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
  let viewer;
  try {
    viewer = await requireMember();
  } catch {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await findMemberById(viewer.activeMemberId!);
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

  return NextResponse.json({ record });
}
