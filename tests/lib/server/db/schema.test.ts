import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { organizations, managers, members, medicalRecords, admins } from '@/lib/server/db/schema';

describe('organizations schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(organizations));
    expect(columns).toEqual(['id', 'name', 'createdAt']);
  });
});

describe('managers schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(managers));
    expect(columns).toEqual([
      'id',
      'organizationId',
      'phoneNumber',
      'position',
      'createdAt',
    ]);
  });
});

describe('members schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(members));
    expect(columns).toEqual([
      'id',
      'organizationId',
      'name',
      'phoneNumber',
      'gender',
      'ageBand',
      'occupation',
      'consentSignatureUrl',
      'createdAt',
    ]);
  });
});

describe('medicalRecords schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(medicalRecords));
    expect(columns).toEqual([
      'id',
      'memberId',
      'organizationId',
      'memberName',
      'memberPhoneNumber',
      'recordDate',
      'documentTexts',
      'recordingText',
      'interviewRecord',
      'diagnosisResult',
      'precautions',
      'notableFindings',
      'isCritical',
      'createdAt',
    ]);
  });
});

describe('admins schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(admins));
    expect(columns).toEqual(['id', 'phoneNumber', 'name', 'createdAt']);
  });
});
