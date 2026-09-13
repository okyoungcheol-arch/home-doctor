import { eq, asc, desc } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { medicalRecords, members, type MedicalRecord, type NewMedicalRecord } from '@/lib/server/db/schema';

export type MedicalRecordWithMemberName = MedicalRecord & { memberName: string };

export async function createRecord(input: NewMedicalRecord): Promise<MedicalRecord> {
  const db = getDb();
  const [row] = await db.insert(medicalRecords).values(input).returning();
  return row;
}

export async function listRecordsForOrganization(
  organizationId: string,
): Promise<MedicalRecordWithMemberName[]> {
  const db = getDb();
  return db
    .select({
      id: medicalRecords.id,
      memberId: medicalRecords.memberId,
      organizationId: medicalRecords.organizationId,
      recordDate: medicalRecords.recordDate,
      documentTexts: medicalRecords.documentTexts,
      recordingText: medicalRecords.recordingText,
      interviewRecord: medicalRecords.interviewRecord,
      notableFindings: medicalRecords.notableFindings,
      isCritical: medicalRecords.isCritical,
      createdAt: medicalRecords.createdAt,
      memberName: members.name,
    })
    .from(medicalRecords)
    .innerJoin(members, eq(medicalRecords.memberId, members.id))
    .where(eq(medicalRecords.organizationId, organizationId))
    .orderBy(asc(members.name), desc(medicalRecords.recordDate));
}
