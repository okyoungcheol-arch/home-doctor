import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/server/auth/authorize';
import { createRecord, listRecordsForUser } from '@/lib/server/records/repository';

const createRecordSchema = z.object({
  phoneNumber: z.string().min(1),
  prescriptionText: z.string().nullable().optional(),
  recordingText: z.string().nullable().optional(),
  interviewRecord: z.record(z.string(), z.unknown()),
  isCritical: z.boolean(),
});

export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await requireMember();
  } catch {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
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

  const record = await createRecord({
    clerkUserId: viewer.userId!,
    organizationId: viewer.organizationId,
    phoneNumber: parsed.data.phoneNumber,
    prescriptionText: parsed.data.prescriptionText ?? null,
    recordingText: parsed.data.recordingText ?? null,
    interviewRecord: parsed.data.interviewRecord,
    isCritical: parsed.data.isCritical,
  });

  return NextResponse.json({ record });
}

export async function GET() {
  let viewer;
  try {
    viewer = await requireMember();
  } catch {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const records = await listRecordsForUser(viewer.userId!);
  return NextResponse.json({ records });
}
