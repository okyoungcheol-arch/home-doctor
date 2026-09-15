import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { listMembersForOrganization } from '@/lib/server/organizations/repository';
import { guard } from '@/lib/server/http';

export async function GET(request: Request) {
  const guarded = await guard(requireAdmin, 'admin 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId가 필요합니다.' }, { status: 400 });
  }

  const members = await listMembersForOrganization(organizationId);
  return NextResponse.json({ members });
}
