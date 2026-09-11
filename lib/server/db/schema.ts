import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const medicalRecords = pgTable(
  'medical_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').notNull(),
    organizationId: text('organization_id'),
    phoneNumber: text('phone_number').notNull(),
    recordDate: timestamp('record_date', { withTimezone: true }).notNull().defaultNow(),
    prescriptionText: text('prescription_text'),
    recordingText: text('recording_text'),
    interviewRecord: jsonb('interview_record').$type<Record<string, unknown>>().notNull(),
    historicalComparisonNote: text('historical_comparison_note'),
    isCritical: boolean('is_critical').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('medical_records_org_date_idx').on(table.organizationId, table.recordDate),
    index('medical_records_user_date_idx').on(table.clerkUserId, table.recordDate),
  ],
);

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type NewMedicalRecord = typeof medicalRecords.$inferInsert;
