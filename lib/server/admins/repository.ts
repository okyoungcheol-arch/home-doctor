import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { admins, type Admin, type NewAdmin } from '@/lib/server/db/schema';

export async function findAdminByPhoneNumber(phoneNumber: string): Promise<Admin | null> {
  const db = getDb();
  const [row] = await db.select().from(admins).where(eq(admins.phoneNumber, phoneNumber));
  return row ?? null;
}

export async function createAdmin(input: NewAdmin): Promise<Admin> {
  const db = getDb();
  const [row] = await db.insert(admins).values(input).returning();
  return row;
}
