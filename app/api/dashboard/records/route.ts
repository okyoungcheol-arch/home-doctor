import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { listRecordsForOrganization } from '@/lib/server/records/repository';
import { guard } from '@/lib/server/http';

export async function GET() {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  const records = await listRecordsForOrganization(guarded.value.organizationId!);
  return NextResponse.json({ records });
}
