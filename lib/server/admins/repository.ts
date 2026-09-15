import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { normalizePhoneNumber } from '@/lib/phone';
import { hashPin } from '@/lib/server/admins/pin';
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

/**
 * 기존 관리자 계정에 PIN을 설정(또는 교체)한다 — `scripts/set-admin-pin.ts` 전용 진입점이다.
 * 해당 전화번호의 관리자가 없으면 `null`을 반환한다.
 */
export async function setAdminPinByPhoneNumber(phoneNumber: string, pin: string): Promise<Admin | null> {
  const db = getDb();
  const [row] = await db
    .update(admins)
    .set({ pinCode: hashPin(pin) })
    .where(eq(admins.phoneNumber, normalizePhoneNumber(phoneNumber)))
    .returning();
  return row ?? null;
}
