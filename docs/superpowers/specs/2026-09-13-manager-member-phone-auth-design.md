# 매니저/회원 전화번호 기반 인증 및 데이터 모델 — 설계 문서

- 작성일: 2026-09-13
- 상태: 설계 확정 (구현 계획 작성 완료)
- 용도: 개인/학습용 프로토타입의 운영 모델 전면 재구축

## 0. 이 문서가 바꾸는 것

기존 설계(`docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`)와 `CLAUDE.md`의 핵심 전역 제약 중 다음 항목을 이 문서가 대체한다.

> 무계정 게스트 모드는 없다 — 회원가입/로그인(Clerk, 이메일+비밀번호) 없이는 앱을 쓸 수 없다.

이제 앱은 세 가지 진입 경로를 제공한다: 관리자(admin, Clerk 이메일+비밀번호 로그인), 매니저(전화번호 기반 세션), 손님(로그인 없음, 결과 미저장). 회원(member)은 개별 계정이 아니라 매니저가 등록해두는 대상이며, 매니저가 앱을 켜서 회원을 선택하면 그 회원 명의로 문진이 진행된다. 기존의 개별 Clerk 계정 기반 모델과 Clerk Organizations API에 의존한 매니저 임명 흐름은 제거되고, 새로운 `organizations`, `managers`, `members` 테이블과 자체 서명 쿠키 기반 세션 시스템으로 교체된다.

## 1. 목적

1. 단체(요양원, 보건소 등)의 관리자(admin)가 웹 대시보드에서 조직을 등록하고, 현장 매니저를 전화번호+직위로 등록한다.
2. 매니저는 등록된 전화번호를 입력하는 것만으로 세션을 획득해 앱에 진입한다(비밀번호, PIN, OTP 없음 — 개인 프로토타입 수준의 낮은 보안).
3. 매니저는 자신의 단체에 속한 회원(어르신 등) 목록을 본 뒤, 한 명을 선택해 그 회원으로서 문진을 진행해준다. 회원은 스스로 로그인하지 않는다.
4. 문진 결과(텍스트, 전문의 소견, 종합 의견)는 회원 명의로 Postgres에 영구 저장된다. 원본 오디오/이미지는 저장하지 않는다.
5. 손님(guest)도 여전히 로그인 없이 즉시 문진을 시작할 수 있으나, 결과는 저장되지 않는다(기존 게스트 모드 재도입).

## 2. 범위 결정 사항

- **이 모델이 가정하는 사용 사례**: 단체 내 담당자(매니저)가 현장에서 태블릿/폰으로 다수의 회원 문진을 대신 진행해주는 구조. 개별 사용자가 각자 계정을 만들어 쓰는 모델이 아니다.
- **매니저 인증 보안 수준**: 전화번호만으로 허용(비밀번호/OTP 없음). 실제 운영 배포 시엔 더 강한 인증(OTP 등)으로 강화되어야 하지만, 개인 프로토타입 전제 하에 현재는 낮은 수준으로 설정.
- **회원 등록**: 매니저가 앱 내에서 이름/전화번호/성별/연령대(5세 구간)/직업 5개 필드를 모두 입력해 등록. 회원이 스스로 가입하는 프로세스는 없다.
- **프론트/백엔드 분리 수준**: 단일 Next.js 저장소 내에서 `lib/server/`(백엔드)와 `app/`, `components/`(프론트엔드)를 논리적으로 분리한다. 별도 배포 단위로 쪼개지 않는다.
- **AI 파이프라인 확장**: 처방전/의사소견서 등 문서를 최대 2개까지 동시에 업로드할 수 있다(기존: 1개만). 종합 소견 생성에는 Opus 5를 사용한다(기존: Sonnet 5).
- **기존 Clerk Organizations API 제거**: 더 이상 사용하지 않으며, 모든 조직/매니저 관리는 새 DB 테이블 CRUD로 구현한다.

## 3. 역할 모델

| 역할 | 인증 방식 | 판별 | 권한 |
|---|---|---|---|
| 관리자(admin) | Clerk 이메일+비밀번호 | `publicMetadata.role === 'admin'` | 조직 생성, 매니저 등록(소속단체+전화번호+직위), 매니저 목록 조회 |
| 매니저(manager) | 전화번호(자체 서명 쿠키) | `managers` 테이블 조회, JWT 쿠키 검증 | 자신의 단체에 속한 회원 등록/조회, 회원 선택하여 문진 진행 |
| 회원(member) | 매니저가 선택 | 매니저 세션의 `activeMemberId` | 선택되면 트리아지~종합 소견까지 문진 진행. DB에 문진 결과 저장 |
| 손님(guest) | 없음 | Clerk 세션 없음, 매니저 쿠키 없음 | 로그인 없이 즉시 문진 시작. 결과는 DB에 저장되지 않음 |

- 한 명의 매니저는 여러 회원을 등록하고 차례로 선택하며, 매니저 자신도 회원으로 등록되어 자신에게 문진을 할 수 있다.
- admin은 Clerk를 계속 사용하며, manager/guest/member 세션은 자체 서명 쿠키 기반이다.

## 4. 데이터 모델

### 새로운 테이블

```ts
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
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
  gender: text('gender').notNull(), // GENDER_OPTIONS와 동일한 값
  ageBand: text('age_band').notNull(), // AGE_BANDS와 동일한 값 (5세 구간)
  occupation: text('occupation').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 기존 medical_records 테이블 재정의

```ts
export const medicalRecords = pgTable('medical_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  recordDate: timestamp('record_date', { withTimezone: true }).notNull().defaultNow(),
  documentTexts: jsonb('document_texts').$type<string[]>().notNull().default([]), // 최대 2개 문서 추출 텍스트
  recordingText: text('recording_text'),
  interviewRecord: jsonb('interview_record').$type<Record<string, unknown>>().notNull(),
  notableFindings: text('notable_findings'), // 종합 소견의 특이사항 요약
  isCritical: boolean('is_critical').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('medical_records_org_date_idx').on(table.organizationId, table.recordDate),
  index('medical_records_member_date_idx').on(table.memberId, table.recordDate),
]);
```

**변경 사항**:
- 기존 `clerkUserId` 제거 → `memberId` FK로 교체
- 기존 텍스트 타입 `organizationId` 제거 → UUID FK로 교체
- 기존 `prescriptionText`(1개) 제거 → `documentTexts`(최대 2개, 배열) 추가
- 기존 `historicalComparisonNote` 제거 → `notableFindings` 추가
- 마이그레이션은 `npm run db:push`(drizzle-kit)로 적용

## 5. 인증/세션 모델

### Admin 세션 (기존 유지)
- Clerk 이메일+비밀번호 로그인
- `publicMetadata.role === 'admin'` 확인으로 admin 판별
- 로직은 기존과 동일

### Manager/Guest/Member 세션 (신규)

신규 의존성: `jose` (HttpOnly JWT 쿠키).

**`lib/server/auth/session.ts` 신설**:
- `createManagerSession(managerId, organizationId)`: 매니저가 전화번호 제출 시 호출, 쿠키 발급
- `setActiveMember(memberId)`: 매니저가 회원 선택 시, 쿠키에 `activeMemberId` 추가
- `clearActiveMember()`: 문진 완료 또는 "처음으로" 버튼 클릭 시 `activeMemberId` 제거(매니저 로그인은 유지)
- `readSession()`: 현재 요청 쿠키를 검증해 페이로드 반환, 없거나 검증 실패 시 `null`

**쿠키 페이로드 형태**:
```ts
{
  role: 'manager',
  managerId: string,
  organizationId: string,
  activeMemberId?: string, // 회원 선택 시에만 있음
}
```

### 역할 판별 우선순위

`lib/server/auth/authorize.ts`의 `getViewer()` 확장:
1. Clerk 세션 있고 `publicMetadata.role === 'admin'` → **`admin`**
2. Task 3의 `readSession()`이 매니저 페이로드 반환 → **`manager`** (+ `activeMemberId` 있으면 함께 노출)
3. 그 외 → **`guest`**

**가드 함수**:
- `requireAdmin()`: 변경 없음
- `requireManager()`: 매니저 세션 확인, 없으면 AuthorizationError
- `requireMember()`: 의미 변경 — "로그인한 회원 본인"이 아니라 "활성 회원(`activeMemberId`)이 설정돼 있는지" 확인

### 미들웨어 보호 범위

`proxy.ts`의 `PROTECTED_ROUTE_PATTERNS`:
- **Clerk 보호 대상**: `/admin(.*)`, `/api/admin(.*)` 만 유지
- **제거 대상**: `/dashboard(.*)`, `/api/dashboard(.*)`, `/api/records(.*)`, AI 문진 라우트들 — 미들웨어 보호 제거
  - 각 라우트 핸들러 내부에서 `getViewer()` + `requireManager()`/세션 쿠키 검사로 인가 수행
  - 손님도 AI 라우트는 호출해야 하므로 미들웨어에서 일괄 차단하면 안 됨

## 6. 화면/라우팅 구조

### 최초 화면: WelcomeScreen

"손님입장" 또는 "매니저 전화번호 입장" 2버튼. admin 로그인 링크는 일반 사용자 동선에 노출하지 않음(하단 작은 텍스트 링크 또는 완전 제거, URL 직접 접근으로 문서화).

### Admin 라우트 (Clerk 보호)

- **`/sign-in`**: Clerk 이메일+비밀번호 로그인(admin 용)
- **`/admin`**: 조직 생성 폼 + 매니저 등록 폼(단체 선택 드롭다운 + 전화번호 + 직위 입력)
  - `/api/admin/organizations` (POST): 조직 생성
  - `/api/admin/managers` (POST): 매니저 등록 (기존 Clerk Organizations API 호출 제거, 새 테이블 CRUD로 교체)

### Manager 라우트 (세션 쿠키 보호)

- **`/manager-entry`** (신규): 전화번호 입력 폼
  - `/api/manager-entry` (POST): `managers` 테이블 조회 → 세션 발급 → `/dashboard`로 리다이렉트
  
- **`/dashboard`**: 두 영역
  1. 회원 등록 폼 (이름/전화번호/성별/연령대/직업)
     - `/api/dashboard/members` (POST): 회원 저장
  2. 소속단체 회원명 목록
     - `/api/dashboard/members` (GET): 회원 목록 조회
     - `/api/dashboard/select-member` (POST): 회원 선택 → `activeMemberId` 세션 설정 → `/` 이동
  3. 기존 기록 테이블 (회원명 컬럼 추가, 회원별 그룹핑)

### Interview 라우트 (세션 검사 + guest 허용)

- **`/`** (InterviewApp): `getViewer()` 결과에 따라 분기
  - `admin` → `/admin`
  - `manager` (활성 회원 없음) → `/dashboard`
  - `manager` (활성 회원 있음) 또는 `guest` → InterviewApp 렌더
  
- **`/api/transcribe`, `/api/triage`, `/api/specialists`, `/api/synthesis`**: 제거된 라우트 보호 유지, 손님도 호출 가능

- **`/api/records`** (POST): 문진 완료 시 저장
  - 활성 회원이 있는 매니저만 저장 가능
  - 손님은 호출 스킵

### 삭제되는 라우트

- `/sign-up`, `/complete-profile` (라우트 + `CompleteProfileForm` 컴포넌트)

## 7. AI 파이프라인 변경

### 다중 파일 업로드 + 녹음 결합

`UploadPanel`:
- 문서 파일 최대 2개 (각각 이미지/PDF) 입력 슬롯
- 음성 녹음 섹션
- 최소 1개 입력 필수 (문서 또는 녹음 중 하나 이상) → "분석 시작" 활성화

`/api/transcribe` 확장 (또는 새 엔드포인트 `/api/interview-intake` 신설):
- 여러 파일/녹음 입력 수신
- 각각 `transcribeAudio` / `extractDocumentText`로 텍스트화
- 순서 보존해 하나의 "상담 내용" 문자열로 합침
- 트리아지 이하 파이프라인에 합쳐진 `transcript` 문자열로 전달 (프롬프트 계약 변경 없음)

### 의심 질환 프리뷰

기존 `SpecialtySelector` 단계가 이미 "분석 후 추천 내용 확인 → 동의 → 다음 진행" 구조를 충족한다. 문구만 "추천 전문분야 확인" → 의심 질환/증상을 더 앞세운 한국어 존댓말 카피로 다듬기 (새 화면 불필요).

### Opus 5 전환

`lib/ai/models.ts`의 `TEXT_MODEL` 기본값을 `'anthropic/claude-opus-5'`로 변경 (환경변수 오버라이드 로직 유지).

### 저장 시 특이사항 채우기

`finishInterview` / `saveRecord`가 `report.redFlags` (+ 필요시 `overallImpression`)를 요약해 `notableFindings`에 채운다.

## 8. 저장소 구조 (프론트/백엔드 논리적 분리)

```
lib/server/                         ← 백엔드 전용, 클라이언트 import 금지
  db/schema.ts                      Drizzle 스키마 (organizations, managers, members, medical_records)
  db/client.ts                      getDb() 지연 초기화
  records/repository.ts             CRUD + 조직/회원 필터링
  auth/
    authorize.ts                    역할 판별 및 가드 함수 (getViewer, requireAdmin, requireManager, requireMember)
    session.ts                      자체 서명 쿠키 기반 세션 (신규)
    patientProfile.ts               회원 프로필 조회 (세션 기반으로 변경)

app/api/
  manager-entry/route.ts            POST: 매니저 전화번호 입장 처리
  admin/
    organizations/route.ts          POST: 조직 생성
    managers/route.ts               POST: 매니저 등록 (신규, 기존 Clerk 기반 제거)
  dashboard/
    members/route.ts                GET/POST: 회원 목록 조회/등록
    select-member/route.ts          POST: 회원 선택
    records/route.ts                GET: 기록 조회 (회원명 조인)
  records/route.ts                  GET/POST: 문진 결과 저장/조회

app/(app)/                          ← 프론트엔드
  page.tsx                          기존 7단계 파이프라인 + getViewer() 라우팅
  sign-in/                          Clerk 로그인 (admin 용)
  admin/page.tsx                    관리자 화면 (조직 생성, 매니저 등록)
  manager-entry/page.tsx            전화번호 입력 폼 (신규)
  dashboard/page.tsx                매니저 대시보드 (회원 등록/선택, 기록 조회) (신규)
```

경계 규칙: 클라이언트 컴포넌트/코드는 `lib/server/**`를 직접 import하지 않고, 항상 `fetch('/api/...')`로만 접근한다.

## 9. 기존 7단계 파이프라인과의 통합 지점

통합 지점은 두 곳이다.

**입력 결합**: `UploadPanel` → `/api/transcribe` (또는 `/api/interview-intake`)
- 다중 파일 + 녹음을 단일 `transcript` 문자열로 합침
- 트리아지~종합 파이프라인은 변경 없음

**저장**: `finishInterview()` → `/api/records` (POST)
- `memberId`, `organizationId`, `documentTexts`, `recordingText`, `interviewRecord`, `notableFindings`, `isCritical` 저장
- 활성 회원이 있어야 저장 가능 (손님 세션은 호출 스킵)
- 손님이 아닌 경우만 호출

그 외 트리아지/전문의/문진/종합 로직은 변경하지 않는다. 입력만 다중 파일을 지원하고, 출력 저장소가 새 스키마로 바뀐다.

## 10. 보안

- **admin**: 기존 Clerk 비밀번호 해싱·세션·무차별 대입 방지 유지
- **manager**: 전화번호만으로 인증 (낮은 보안 수준, 개인 프로토타입 전제)
  - 실제 운영 배포 시엔 OTP/재인증 강화 필요
- **쿠키**: HttpOnly, 자체 서명, JWT 검증
- **DATABASE_URL**: 서버 전용 환경변수, 클라이언트 노출 금지
- **권한 재확인**: 모든 `/api/admin/**`, `/api/dashboard/**`에서 서버가 Clerk/쿠키 재검증
- **매니저 조회**: 항상 실제 소속단체로 필터링 (다른 단체 데이터 열람 불가)
- **원본 파일 미저장**: 텍스트만 저장해 유출 시 피해 범위 최소화
- **admin 승격**: 공개 API 아님, 로컬 스크립트만 사용

## 11. 에러 처리

- **환경변수 미설정**: 지연 초기화 (`getDb()`) 패턴으로 빌드 타임 크래시 방지
- **저장 실패**: 화면에 표시된 종합소견은 유지, 콘솔/비침습 배너로만 알림
- **인증/인가 실패**: 401/403으로 명확히 구분

## 12. 테스트

### 자동 테스트 (Vitest)

- 세션 유틸: 발급→읽기 왕복, 위조/만료 쿠키 거부
- `getViewer()`: 우선순위 분기 (admin/manager/guest)
- 가드 함수: `requireAdmin`, `requireManager`, `requireMember(activeMemberId 확인)`
- API 라우트: 매니저 로그인 성공/실패, 회원 등록, 회원 선택, 기록 저장
- 저장소 필터링: 조직/회원별 조회 권한

### 수동 검증 (`npm run dev`)

1. 손님입장 → 파일 2개(이미지/PDF) + 녹음 최소 1개로 트리아지~종합 완료 → DB 미저장 확인
2. Admin 로그인 → 조직 생성 → 매니저 등록(단체/전화번호/직위) 확인
3. 매니저 전화번호 입장 → 대시보드에서 회원 등록(이름/전화번호/성별/연령대/직업) → 목록 표시 확인
4. 회원 선택 → 문진(문서 2개 동시 업로드) → 완료 후 대시보드 회원명 조회 + `notableFindings` 확인
5. 미등록 전화번호 입장 시도 → 거부 확인

## 13. 이번 스펙에 포함하지 않는 것

- **매니저 다중 가입 (여러 단체)**: 매니저는 하나의 단체에만 등록된다.
- **회원 다중 단체 소속**: 회원은 하나의 단체에만 속한다.
- **회원 → 매니저 승격**: 회원의 역할 변경은 스펙 범위 밖.
- **손님 → 회원 전환**: 별도 서브프로젝트.
- **강화 인증 (OTP 등)**: 실제 운영 배포 시 별도 작업.
- **데이터 보존기간/삭제 정책**: 후속 결정 사항.
