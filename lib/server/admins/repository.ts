import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { normalizePhoneNumber } from '@/lib/phone';
import { admins, type Admin, type NewAdmin } from '@/lib/server/db/schema';

// 화면에는 하이픈 포맷(010-1234-5678)으로 표시하더라도, 저장/조회는 항상 숫자만 남긴 형태로
// 비교한다 — 표시 포맷이 바뀌어도 기존에 저장된 전화번호와 계속 일치하도록 하기 위함이다.
export async function findAdminByPhoneNumber(phoneNumber: string): Promise<Admin | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(admins)
    .where(eq(admins.phoneNumber, normalizePhoneNumber(phoneNumber)));
  return row ?? null;
}

export async function createAdmin(input: NewAdmin): Promise<Admin> {
  const db = getDb();
  const [row] = await db
    .insert(admins)
    .values({ ...input, phoneNumber: normalizePhoneNumber(input.phoneNumber) })
    .returning();
  return row;
}
