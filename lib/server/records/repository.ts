import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { medicalRecords, type MedicalRecord, type NewMedicalRecord } from '@/lib/server/db/schema';

export async function createRecord(input: NewMedicalRecord): Promise<MedicalRecord> {
  const db = getDb();
  const [row] = await db.insert(medicalRecords).values(input).returning();
  return row;
}

export async function listRecordsForMember(memberId: string): Promise<MedicalRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.memberId, memberId))
    .orderBy(desc(medicalRecords.recordDate));
}
