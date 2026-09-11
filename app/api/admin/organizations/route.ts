import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/server/auth/authorize';

const createOrganizationSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const client = await clerkClient();
  const organization = await client.organizations.createOrganization({ name: parsed.data.name });

  return NextResponse.json({ organization: { id: organization.id, name: organization.name } });
}
