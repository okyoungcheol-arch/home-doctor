import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { managers, type Manager } from '@/lib/server/db/schema';

export async function findManagerByPhoneNumber(phoneNumber: string): Promise<Manager | null> {
  const db = getDb();
  const [row] = await db.select().from(managers).where(eq(managers.phoneNumber, phoneNumber));
  return row ?? null;
}
