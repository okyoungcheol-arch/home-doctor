import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { createMember, listMembersForOrganization } from '@/lib/server/organizations/repository';
import { AGE_BANDS, GENDER_VALUES, OCCUPATIONS } from '@/lib/profile/constants';
import { guard, parseJsonBody } from '@/lib/server/http';

const createMemberSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  gender: z.enum(GENDER_VALUES),
  ageBand: z.enum(AGE_BANDS),
  occupation: z.enum(OCCUPATIONS),
});

export async function POST(request: Request) {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMemberSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const member = await createMember({ organizationId: guarded.value.organizationId!, ...parsed.data });

  return NextResponse.json({ member });
}

export async function GET() {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const members = await listMembersForOrganization(guarded.value.organizationId!);
  return NextResponse.json({ members });
}
