import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { clearActiveMember } from '@/lib/server/auth/session';

export async function POST() {
  try {
    await requireManager();
  } catch {
    return NextResponse.json({ error: '매니저 권한이 필요합니다.' }, { status: 403 });
  }
  await clearActiveMember();
  return NextResponse.json({ success: true });
}
