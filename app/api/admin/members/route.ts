import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/server/auth/authorize';

const assignMemberSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['org:member', 'org:admin']),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = assignMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { organizationId, userId, role } = parsed.data;
  const client = await clerkClient();

  const memberships = await client.organizations.getOrganizationMembershipList({ organizationId });
  const existing = memberships.data.find(
    (m: { publicUserData?: { userId?: string } }) => m.publicUserData?.userId === userId,
  );

  const membership = existing
    ? await client.organizations.updateOrganizationMembership({ organizationId, userId, role })
    : await client.organizations.createOrganizationMembership({ organizationId, userId, role });

  return NextResponse.json({ membership: { userId, organizationId, role: membership.role } });
}
