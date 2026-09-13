import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { createMember, listMembersForOrganization } from '@/lib/server/organizations/repository';
import { AGE_BANDS, GENDER_OPTIONS, OCCUPATIONS } from '@/lib/profile/constants';

const GENDER_VALUES = GENDER_OPTIONS.map((option) => option.value) as [string, ...string[]];

const createMemberSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  gender: z.enum(GENDER_VALUES),
  ageBand: z.enum(AGE_BANDS),
  occupation: z.enum(OCCUPATIONS),
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

  const parsed = createMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await createMember({ organizationId: viewer.organizationId!, ...parsed.data });

  return NextResponse.json({ member });
}

export async function GET() {
  let viewer;
  try {
    viewer = await requireManager();
  } catch {
    return NextResponse.json({ error: '매니져 권한이 필요합니다.' }, { status: 403 });
  }

  const members = await listMembersForOrganization(viewer.organizationId!);
  return NextResponse.json({ members });
}
