import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneNumber: text('phone_number').notNull().unique(),
  name: text('name').notNull(),
  // nullable — 대부분의 관리자는 여전히 전화번호만으로 로그인한다(의도된 저보안 기본값). PIN을
  // 설정한 계정만 로그인 시 추가로 검증된다. `scripts/set-admin-pin.ts`가 평문이 아니라
  // `lib/server/admins/pin.ts`의 `hashPin()` 결과("salt:hash" 형태)를 저장한다.
  pinCode: text('pin_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const managers = pgTable('managers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  phoneNumber: text('phone_number').notNull().unique(),
  position: text('position').notNull(), // 직위
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  gender: text('gender').notNull(), // GENDER_OPTIONS와 동일한 값 재사용
  ageBand: text('age_band').notNull(), // AGE_BANDS와 동일한 값 재사용 (이미 5세 구간)
  occupation: text('occupation').notNull(),
  consentSignatureUrl: text('consent_signature_url'), // nullable — 기존 회원은 서명 없음, 신규 등록만 API/화면에서 필수로 강제
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const medicalRecords = pgTable('medical_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  memberName: text('member_name').notNull(), // 방문 시점 회원 이름 스냅샷 (members.name과 별개, 이후 변경돼도 보존)
  memberPhoneNumber: text('member_phone_number').notNull(), // 방문 시점 회원 전화번호 스냅샷 (members.phoneNumber와 별개)
  recordDate: timestamp('record_date', { withTimezone: true }).notNull().defaultNow(),
  documentTexts: jsonb('document_texts').$type<string[]>().notNull().default([]), // 문서 업로드(최대 2개) 추출 텍스트
  recordingText: text('recording_text'),
  interviewRecord: jsonb('interview_record').$type<Record<string, unknown>>().notNull(),
  diagnosisResult: text('diagnosis_result').notNull(), // 종합 소견 overallImpression 기반 진단 요약
  precautions: text('precautions').notNull(), // 종합 소견 recommendedActions를 합친 주의사항 텍스트
  notableFindings: text('notable_findings'), // 종합 소견 redFlags/overallImpression 요약 ("특이사항")
  isCritical: boolean('is_critical').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('medical_records_org_date_idx').on(table.organizationId, table.recordDate),
  index('medical_records_member_date_idx').on(table.memberId, table.recordDate),
]);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;

export type Manager = typeof managers.$inferSelect;
export type NewManager = typeof managers.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type NewMedicalRecord = typeof medicalRecords.$inferInsert;
