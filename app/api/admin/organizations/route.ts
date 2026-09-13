import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { createOrganization, listOrganizations } from '@/lib/server/organizations/repository';

const createOrganizationSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const organization = await createOrganization(parsed.data.name);

  return NextResponse.json({ organization: { id: organization.id, name: organization.name } });
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  const organizations = await listOrganizations();

  return NextResponse.json({ organizations });
}
