import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { listRecordsForOrganization } from '@/lib/server/records/repository';

export async function GET() {
  let viewer;
  try {
    viewer = await requireManager();
  } catch {
    return NextResponse.json({ error: '매니저 권한이 필요합니다.' }, { status: 403 });
  }

  const records = await listRecordsForOrganization(viewer.organizationId!);
  return NextResponse.json({ records });
}
