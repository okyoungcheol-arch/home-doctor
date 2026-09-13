import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { createOrganization, listOrganizations } from '@/lib/server/organizations/repository';
import { guard, parseJsonBody } from '@/lib/server/http';

const createOrganizationSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createOrganizationSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const organization = await createOrganization(parsed.data.name);

  return NextResponse.json({ organization: { id: organization.id, name: organization.name } });
}

export async function GET() {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const organizations = await listOrganizations();

  return NextResponse.json({ organizations });
}
