import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/authorize';
import { createManager } from '@/lib/server/organizations/repository';

const createManagerSchema = z.object({
  organizationId: z.string().min(1),
  phoneNumber: z.string().min(1),
  position: z.string().min(1),
});

const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

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

  const parsed = createManagerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  let manager;
  try {
    manager = await createManager(parsed.data);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      return NextResponse.json({ error: '이미 등록된 전화번호입니다.' }, { status: 409 });
    }
    if (err instanceof Error && (err as { code?: string }).code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json({ error: '존재하지 않는 단체입니다.' }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({
    manager: {
      id: manager.id,
      organizationId: manager.organizationId,
      phoneNumber: manager.phoneNumber,
      position: manager.position,
    },
  });
}
