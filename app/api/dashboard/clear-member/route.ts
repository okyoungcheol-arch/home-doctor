import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { clearActiveMember } from '@/lib/server/auth/session';
import { guard } from '@/lib/server/http';

export async function POST() {
  const guarded = await guard(requireManager, '매니저 권한이 필요합니다.', 403);
  if (!guarded.ok) return guarded.response;

  await clearActiveMember();
  return NextResponse.json({ success: true });
}
