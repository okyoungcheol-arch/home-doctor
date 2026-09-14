import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManager } from '@/lib/server/auth/authorize';
import { createMember, listMembersForOrganization } from '@/lib/server/organizations/repository';
import { uploadSignature } from '@/lib/server/blob';
import { AGE_BANDS, GENDER_VALUES, OCCUPATIONS } from '@/lib/profile/constants';
import { guard, parseJsonBody } from '@/lib/server/http';

const createMemberSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  gender: z.enum(GENDER_VALUES),
  ageBand: z.enum(AGE_BANDS),
  occupation: z.enum(OCCUPATIONS),
  signatureImage: z.string().max(2_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
});

const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(request: Request) {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMemberSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const signatureBuffer = Buffer.from(
    parsed.data.signatureImage.replace(/^data:image\/png;base64,/, ''),
    'base64',
  );

  if (!signatureBuffer.subarray(0, 8).equals(PNG_MAGIC_BYTES)) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  let signatureUrl: string;
  try {
    signatureUrl = await uploadSignature(guarded.value.organizationId!, signatureBuffer);
  } catch (error) {
    console.error('서명 이미지 업로드 실패:', error);
    return NextResponse.json({ error: '서명 저장에 실패했습니다.' }, { status: 500 });
  }

  const member = await createMember({
    organizationId: guarded.value.organizationId!,
    name: parsed.data.name,
    phoneNumber: parsed.data.phoneNumber,
    gender: parsed.data.gender,
    ageBand: parsed.data.ageBand,
    occupation: parsed.data.occupation,
    consentSignatureUrl: signatureUrl,
  });

  const { consentSignatureUrl: _consentSignatureUrl, ...memberResponse } = member;
  return NextResponse.json({ member: memberResponse });
}

export async function GET() {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const members = await listMembersForOrganization(guarded.value.organizationId!);
  return NextResponse.json({ members });
}
