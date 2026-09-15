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

/**
 * 회원별 "가장 최근 기록의 severityLevel"만 모아 반환한다(대시보드 회원 목록의 경고등용) —
 * 회원을 선택하기 전에도 노출되는 유일한 정보이므로, 전체 특이사항 텍스트가 아니라 1~5 등급
 * 숫자 하나로만 제한한다. 기록이 여러 건이어도 정렬 후 memberId당 처음 만나는(=가장 최근) 값만
 * 취한다 — DISTINCT ON 대신 애플리케이션에서 축약하는 편이 이 정도 규모에서는 더 단순하다.
 */
export async function listLatestSeverityByMember(
  organizationId: string,
): Promise<Map<string, number | null>> {
  const db = getDb();
  const rows = await db
    .select({ memberId: medicalRecords.memberId, severityLevel: medicalRecords.severityLevel })
    .from(medicalRecords)
    .where(eq(medicalRecords.organizationId, organizationId))
    .orderBy(desc(medicalRecords.recordDate));

  const latestByMember = new Map<string, number | null>();
  for (const row of rows) {
    if (!latestByMember.has(row.memberId)) {
      latestByMember.set(row.memberId, row.severityLevel);
    }
  }
  return latestByMember;
}
