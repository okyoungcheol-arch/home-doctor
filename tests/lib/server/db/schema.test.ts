import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { medicalRecords } from '@/lib/server/db/schema';

describe('medicalRecords schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(medicalRecords));
    expect(columns).toEqual([
      'id',
      'clerkUserId',
      'organizationId',
      'phoneNumber',
      'recordDate',
      'prescriptionText',
      'recordingText',
      'interviewRecord',
      'historicalComparisonNote',
      'isCritical',
      'createdAt',
    ]);
  });
});
