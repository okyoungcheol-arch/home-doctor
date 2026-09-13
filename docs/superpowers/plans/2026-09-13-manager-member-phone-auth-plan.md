# 홈 닥터 — 매니저/회원 전화번호 기반 재구축 계획

## Context

홈 닥터는 지금까지 "무계정 게스트 모드 없음, Clerk 이메일+비밀번호 로그인 필수"로 막 재정비를
마쳤다(오늘 커밋된 `907ed7f` 계열). 그런데 실제 운영 그림은 다르다: 이 앱은 개별 사용자가 각자
계정을 만들어 쓰는 서비스가 아니라, **단체(요양원/보건소 등)의 매니저가 현장에서 태블릿/폰으로
회원(어르신 등)의 문진을 대신 진행해주는 도구**다. 회원 본인이 이메일/비밀번호를 만들어 로그인하는
모델은 현실과 맞지 않고, 매니저 등록도 Clerk 대시보드에서 User ID를 손으로 복사해와야 하는 지금의
admin 흐름은 실사용이 불가능하다. 이번 작업은 인증/데이터 모델을 다음 그림으로 전면 교체한다.

- **관리자(admin)**: 지금처럼 Clerk 이메일+비밀번호로 로그인. 조직을 만들고 매니저를 등록한다.
- **매니저(manager)**: 개별 Clerk 계정이 없다. admin이 소속단체+전화번호+직위만으로 등록해두면,
  매니저는 그 전화번호를 입력하는 것만으로 입장한다(비밀번호/PIN/OTP 없음 — 개인 학습용
  프로토타입이라는 전제하에 채택한 낮은 보안 수준).
- **회원(member)**: 개별 Clerk 계정이 없다. 매니저가 이름/전화번호/성별/연령대(5세 구간)/직업으로
  등록한다. 회원은 스스로 로그인하지 않는다 — 매니저가 앱을 켜면 자기 소속단체 회원명 목록이 뜨고,
  그중 한 명을 선택해야 문진이 시작된다. 매니저 자신도 회원으로 등록될 수 있다(자기 자신을 목록에서
  선택해 스스로 문진받는 것도 가능).
- **손님(guest)**: 로그인 없이 "손님입장"으로 바로 문진을 쓸 수 있지만, 결과는 저장되지 않는다
  (예전에 있다가 최근 제거된 게스트 모드를 다시 들여오는 것).

부수적으로 AI 문진 파이프라인도 두 가지를 바꾼다: 처방전/의사소견서 등 문서를 한 번에 최대 2개까지
업로드할 수 있게 하고(지금은 파일 1개만 가능), 종합 소견에 쓰는 모델을 Opus 5로 올린다(지금은
Sonnet 5). 프론트/백엔드는 물리적으로 분리하지 않고 지금처럼 하나의 Next.js 프로젝트 안에서
`app/api/*`(백엔드)와 `components/`+`app/page.tsx`(프론트엔드)의 논리적 경계만 더 명확히 한다.

이 변경은 `CLAUDE.md`의 "무계정 게스트 모드는 없다 / Clerk 이메일+비밀번호 로그인 필수" 제약을
정면으로 뒤집는다 — 의도된 것이며, 이 문서 자체를 새 모델에 맞게 다시 쓴다(Task 12).

**전제(사용자 확인 완료)**: 매니저 입장은 전화번호만으로 인증 없이 허용, 관리자는 Clerk 유지,
회원 등록에 이름 필드 포함, 프론트/백엔드는 논리적 분리만, 이 문서 하나로 전체 범위를 계획.
`medical_records`에 기존 실사용 데이터가 있다면(현재는 개인 프로토타입이라 없다고 가정) 이번
스키마 교체로 예전 레코드의 회원 연결 정보가 끊길 수 있음 — 실제 보존해야 할 데이터가 있다면
구현 시작 전에 반드시 확인할 것.

## 새 데이터 모델 (`lib/server/db/schema.ts`)

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
  gender: text('gender').notNull(), // GENDER_OPTIONS와 동일한 값 재사용
  ageBand: text('age_band').notNull(), // AGE_BANDS와 동일한 값 재사용 (이미 5세 구간)
  occupation: text('occupation').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`medical_records`는 Clerk 기반 컬럼을 새 FK로 교체하고, 다중 문서/특이사항 필드를 추가한다:

```ts
export const medicalRecords = pgTable('medical_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  recordDate: timestamp('record_date', { withTimezone: true }).notNull().defaultNow(),
  documentTexts: jsonb('document_texts').$type<string[]>().notNull().default([]), // 문서 업로드(최대 2개) 추출 텍스트
  recordingText: text('recording_text'),
  interviewRecord: jsonb('interview_record').$type<Record<string, unknown>>().notNull(),
  notableFindings: text('notable_findings'), // 종합 소견 redFlags/overallImpression 요약 ("특이사항")
  isCritical: boolean('is_critical').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('medical_records_org_date_idx').on(table.organizationId, table.recordDate),
  index('medical_records_member_date_idx').on(table.memberId, table.recordDate),
]);
```

`clerkUserId`/기존 텍스트 `organizationId`/`prescriptionText`/`historicalComparisonNote`는 제거한다
(개인 프로토타입이라 기존 데이터 보존 없이 스키마를 갈아엎는 것으로 가정). 손님 세션은 애초에
저장하지 않으므로 `memberId`/`organizationId`를 nullable로 둘 필요가 없다.

마이그레이션은 기존 관행대로 `npm run db:push`(drizzle-kit push, 별도 SQL 마이그레이션 파일 없음)로
적용한다.

## 인증/세션 모델

- **admin**: 그대로 Clerk. `getViewer()`가 `publicMetadata.role === 'admin'`이면 admin으로 판정하는
  로직은 유지.
- **manager/guest/member-session**: Clerk를 쓰지 않는 자체 서명 쿠키. 신규 의존성으로 `jose`를
  추가해 HttpOnly 쿠키에 JWT를 담는다(`lib/server/auth/session.ts` 신설):
  - 매니저가 전화번호를 제출하면 `managers` 테이블에서 조회 → 있으면
    `{ role: 'manager', managerId, organizationId }`를 서명해 쿠키로 내려준다.
  - 매니저가 대시보드에서 회원을 선택하면 같은 쿠키(또는 별도의 짧은 쿠키)에 `activeMemberId`를
    추가해 "이 매니저가 지금 이 회원으로 문진 중"임을 표시한다. 문진이 끝나거나 "처음으로"를 누르면
    `activeMemberId`만 지운다(매니저 로그인 자체는 유지 — 같은 세션에서 다음 회원을 이어서 선택).
  - 손님은 쿠키 자체가 없는 상태 그대로 처리한다(새 세션 타입을 만들 필요 없음 — `getViewer()`가
    Clerk 세션도 없고 매니저 쿠키도 없으면 `guest`).
- `lib/server/auth/authorize.ts`의 `getViewer()`를 확장해 Clerk 우선 확인(admin) → 매니저 쿠키 확인
  (`manager`, `activeMemberId` 있으면 `manager-with-member`로 세분화하거나 별도 필드로 노출) → 없으면
  `guest` 순으로 판정하도록 재작성한다. `requireAdmin`/`requireManager`/`requireMember` 가드 함수도
  이 새 모델에 맞게 다시 쓴다(`requireMember`는 이제 "로그인한 회원 본인"이 아니라 "매니저가 선택한
  활성 회원이 있는지"를 확인하는 역할로 바뀐다).
- `proxy.ts`: admin 전용 라우트(`/admin(.*)`, `/api/admin(.*)`)만 Clerk `auth.protect()`로 계속
  보호한다. 매니저/회원/게스트가 쓰는 라우트(`/dashboard`, `/api/dashboard`, `/api/records`, AI 문진
  라우트들)는 미들웨어 레벨 Clerk 보호를 걷어내고, 각 라우트 핸들러 안에서 `getViewer()` +
  `requireManager()`/세션 쿠키 검사로 인가한다(손님도 AI 문진 라우트는 호출해야 하므로 미들웨어에서
  일괄 차단하면 안 됨 — 손님 여부에 따라 저장(`/api/records`)만 별도로 막는다).

## 화면/라우팅 구조

- `WelcomeScreen`: "손님입장"(바로 `InterviewApp`, 세션 없음) / "매니저 전화번호 입장"(전화번호 입력
  폼 → 매니저 세션 발급 → `/dashboard`) 2버튼으로 교체. admin 로그인은 눈에 띄지 않는 링크(예: 하단
  작은 텍스트 링크)로 `/sign-in`에 연결해두거나, admin은 URL을 직접 알고 접근하는 것으로 문서화한다
  (일반 사용자 동선에서 제거).
- `/sign-up`, `/complete-profile` 라우트와 관련 컴포넌트(`CompleteProfileForm`)는 삭제한다 — 더 이상
  개별 회원가입이 없다. `/sign-in`은 admin 로그인용으로만 남긴다.
- `/dashboard`(매니저 전용, 세션 쿠키로 보호): 두 영역으로 재구성.
  1. 회원 등록 폼(이름/전화번호/성별/연령대/직업) → `POST /api/dashboard/members`.
  2. 소속단체 회원명 목록 → 회원 클릭 시 `activeMemberId` 세션 설정 후 `/`(InterviewApp)로 이동.
  3. 기존 기록 조회 테이블은 `members`와 조인해 회원명을 표시하고, 회원별로 그룹핑한다
     (`lib/server/records/repository.ts`의 `listRecordsForOrganization`을 조인 쿼리로 변경).
- `/admin`(Clerk 보호): 조직 생성 폼과 매니저 등록 폼(소속단체 선택 + 전화번호 + 직위)으로 재구성,
  기존 Clerk Organizations API 호출은 전부 새 DB 테이블 CRUD로 교체.
- `app/page.tsx`: `getViewer()` 결과에 따라 admin→`/admin`, manager(활성 회원 없음)→`/dashboard`,
  manager(활성 회원 있음)/guest→`InterviewApp` 렌더로 분기.

## AI 파이프라인 변경

- **다중 파일 업로드**: `UploadPanel`을 문서 최대 2개(각각 이미지/PDF) + 음성 녹음 섹션을 함께
  받을 수 있게 재작성. 파일이나 녹음 중 최소 하나는 있어야 "분석 시작" 가능. 서버 쪽은
  `/api/transcribe`를 확장(또는 이를 감싸는 `/api/interview-intake` 신설)해 여러 입력을 받아 각각
  `transcribeAudio`/`extractDocumentText`로 텍스트화한 뒤, 순서를 보존해 하나의 "상담 내용" 문자열로
  합쳐 트리아지 이하 파이프라인에 그대로 전달한다(트리아지/전문의 프롬프트 계약은 바뀌지 않음).
- **의심 질환 프리뷰 + 동의**: 기존 `SpecialtySelector` 단계(트리아지 추천 확인 후 "문진 시작")가
  이미 이 요구사항(분석 후 추천 내용을 보여주고 동의해야 다음 단계로 진행)을 구조적으로 만족한다.
  문구만 "추천 전문분야 확인"→ 의심되는 질환/증상을 더 앞세우는 카피로 다듬는다. 새 화면을 만들
  필요는 없다.
- **Opus 5 전환**: `lib/ai/models.ts`의 `TEXT_MODEL` 기본값을 `anthropic/claude-opus-5`로 변경
  (`runSynthesis` 전용이라는 기존 용도 그대로 유지 — 별도 상수 신설 불필요).
- **저장 시 특이사항 채우기**: `finishInterview`/`saveRecord`가 `report.redFlags`(+필요시
  `overallImpression`)를 요약해 `notableFindings`에 채워 보낸다(지금까지 비어있던
  `historicalComparisonNote`를 대체).

## 문서 갱신

- `CLAUDE.md`: "핵심 전역 제약" 섹션을 이 계획의 인증/저장 모델로 다시 쓰고, 스펙/계획 문서 위치
  목록에 이번 스펙/플랜 경로를 추가.
- `harness.md`: "회원/저장 아키텍처" 절을 매니저/회원/게스트 3계층 모델로 재작성(Clerk
  Organizations 의존 서술 제거).
- `agent.md`: `TEXT_MODEL` 기본값 언급이 있다면 Opus 5로 갱신.
- `docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`: 이 계획의 설계 부분을
  정식 스펙 문서로 옮겨 커밋(Task 1에서 작성).

## 구현 태스크

각 태스크는 이 저장소의 기존 관행대로 TDD(실패하는 테스트 → 최소 구현 → 통과 확인 → 커밋)를
따르고, 태스크 완료마다 개별 커밋한다. 아래는 태스크별 핵심 파일과 변경 요지다.

**Global Constraints (모든 태스크 공통)**
- 태스크마다 최소 1회 이상 git 커밋(관행: 실패 테스트 → 최소 구현 → 통과 확인 → 커밋).
- UI 문구/에이전트 프롬프트는 한국어 존댓말.
- `generateObject`/`generateText`는 `instructions` 파라미터만 사용(`system` 금지).
- Task 2(DB 스키마 교체)가 `medicalRecords`의 옛 컬럼(`clerkUserId`/`prescriptionText`/
  `historicalComparisonNote`/텍스트 `organizationId`)을 제거한 뒤 Task 15(저장 흐름 갱신)가 모든
  소비 코드를 새 스키마로 맞출 때까지, 그 옛 컬럼을 아직 참조하는 코드 경로에서 발생하는
  `tsc --noEmit`/`npm run build`/기존 테스트 실패는 **의도된 전환기 중 상태**다. Task 2, 4, 6, 7, 8의
  구현자는 이 이유로 실패하는 항목이 있으면 원인(어떤 제거된 컬럼 참조 때문인지)을 리포트에 명시하고
  넘어가도 된다 — 단, 자신이 새로 작성/수정한 코드와 테스트는 반드시 통과해야 한다. Task 15부터는
  `npx vitest run`/`npx tsc --noEmit`/`npm run build`가 다시 전부 통과해야 하며, Task 18에서 최종
  확인한다.

### Task 1: 설계 문서 작성/커밋

이 계획 문서의 Context/새 데이터 모델/인증·세션 모델/화면·라우팅 구조/AI 파이프라인 변경 절 내용을
`docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`로 정리해 작성하고 커밋한다.
(코드 변경 없음 — 문서 작성 태스크.)

### Task 2: DB 스키마 교체

`lib/server/db/schema.ts`에 `organizations`/`managers`/`members` 테이블을 추가하고 `medicalRecords`를
재정의한다(정확한 컬럼 정의는 위 "새 데이터 모델" 절 참고). `npm run db:push`로 실제 DB에 반영한다.
기존 스키마를 참조하는 테스트/코드(`lib/server/records/repository.ts`, `app/api/records/route.ts` 등)는
이후 태스크(4, 8, 15)에서 순차적으로 맞춘다 — 이 태스크에서는 스키마 파일 자체와 그 파일에 대한
테스트(있다면)만 다룬다.

### Task 3: 세션 유틸

`jose` 의존성을 추가한다. `lib/server/auth/session.ts`를 신설해 서명된 HttpOnly 쿠키 기반 세션을
구현한다: `createManagerSession(managerId, organizationId)`(발급), `setActiveMember(memberId)`/
`clearActiveMember()`(활성 회원 설정/해제), `readSession()`(현재 요청의 쿠키를 검증해 페이로드 반환,
없거나 검증 실패 시 null). 페이로드 형태: `{ role: 'manager', managerId, organizationId,
activeMemberId?: string }`. 각 함수의 유닛 테스트를 작성한다(발급→읽기 왕복, 위조/만료 쿠키 거부 등).

### Task 4: `getViewer()`/가드 재작성

`lib/server/auth/authorize.ts`를 다음 우선순위로 재작성한다: Clerk 세션 있고
`publicMetadata.role === 'admin'` → `admin`(기존 로직 유지) → Task 3의 `readSession()`이 매니저
페이로드를 반환 → `manager`(+ `activeMemberId` 있으면 그 필드도 `Viewer`에 포함) → 그 외 → `guest`.
`requireAdmin`(변경 없음)/`requireManager`(매니저 세션 확인)/`requireMember`(의미 변경: "로그인한
회원 본인"이 아니라 "매니저 세션에 활성 회원(`activeMemberId`)이 설정돼 있는지" 확인, 없으면
`AuthorizationError`)로 다시 쓴다. 기존 유닛테스트(`getViewer`/가드 관련)를 새 동작에 맞게 갱신한다.
`isProfileComplete`처럼 이번 모델에서 더 이상 의미가 없어진 헬퍼가 이 파일에 있다면 함께 제거한다
(회원은 매니저가 모든 필드를 채워 등록하므로 "프로필 미완성" 상태 자체가 없어짐).

### Task 5: 매니저 전화번호 입장

전화번호 입력 폼 라우트(신규, 예: `app/manager-entry/page.tsx`)와
`POST /api/manager-entry`(요청 바디의 전화번호로 `managers` 테이블 조회 → 있으면 Task 3의
`createManagerSession`으로 세션 쿠키 발급 후 성공 응답, 없으면 404/400류 응답)를 구현한다. 클라이언트는
성공 시 `/dashboard`로 이동하고, 실패 시 "등록되지 않은 전화번호입니다" 안내를 보여준다. API 라우트
테스트(등록된 번호/미등록 번호 각각) 작성.

### Task 6: 관리자 패널 재구축

`app/api/admin/organizations/route.ts`(조직 생성 — 이름만 받아 `organizations`에 insert)와
`app/api/admin/managers/route.ts`(신규, 기존 `app/api/admin/members/route.ts`가 하던 Clerk
Organizations 기반 "매니저 임명" 역할을 대체 — 소속단체 id/전화번호/직위를 받아 `managers`에 insert)를
Clerk Organizations API 호출 없이 새 테이블 CRUD로 구현한다. 두 라우트 모두 `requireAdmin()`으로
보호. `AdminPanel` UI를 조직 생성 폼 + 매니저 등록 폼(단체 선택 드롭다운 + 전화번호 + 직위 입력)으로
교체한다. 옛 `app/api/admin/members/route.ts`(Clerk User ID 수동 입력 방식)는 이 태스크에서 제거한다.
각 API 라우트의 유닛 테스트 작성.

### Task 7: 매니저 대시보드 — 회원 등록 + 목록/선택

`POST /api/dashboard/members`(이름/전화번호/성별/연령대/직업을 받아 `requireManager()`로 확인한
매니저의 `organizationId`로 `members`에 insert), `GET /api/dashboard/members`(같은 조직 회원 목록
조회), `POST /api/dashboard/select-member`(회원 id를 받아 Task 3의 `setActiveMember`로 세션에
반영)를 구현한다. `ManagerDashboard` UI에 회원 등록 폼과 회원명 목록(각 항목 클릭 시 선택 API 호출 후
`/`로 이동)을 추가한다. 각 API 라우트의 유닛 테스트 작성.

### Task 8: 프로필 소스 교체

`lib/server/auth/patientProfile.ts`의 `getPatientProfile()`을 Clerk `unsafeMetadata` 대신 새 세션
기반으로 다시 쓴다: 게스트(세션 없음)→`null`, 매니저 세션에 `activeMemberId`가 있으면 `members`
테이블에서 해당 행을 조회해 `{ ageBand, gender, occupation }`으로 변환(이름/전화번호는 이 함수의
반환 타입에는 포함하지 않음 — 트리아지/전문의 프롬프트에는 지금처럼 연령대/성별/직업만 전달).
`lib/agents/patientProfile.ts`의 `PatientProfile` 타입/포맷터는 값의 출처만 바뀌므로 그대로 둔다.
`app/api/triage/route.ts`, `app/api/specialists/route.ts`가 새 `getPatientProfile()`을 그대로
호출하는지 확인(호출 시그니처가 바뀌지 않는 한 이 두 라우트는 수정이 필요 없을 수 있다 — 실제로
호출부를 확인해 필요한 경우에만 수정). Task 4에서 다룬 `isProfileComplete` 제거를 이 태스크에서 아직
안 했다면 여기서 마무리한다. 유닛 테스트 갱신(게스트/활성 회원 있음/활성 회원 없음 각 케이스).

### Task 9: 손님 모드 재도입

`WelcomeScreen`을 "손님입장"(클릭 시 세션 없이 바로 `/`로 이동해 `InterviewApp` 렌더)과 "매니저
전화번호 입장"(Task 5의 라우트로 이동) 2버튼으로 교체한다. admin 로그인 링크는 일반 사용자 동선에
노출하지 않는다(예: 페이지 하단의 작은 텍스트 링크로만 `/sign-in` 연결, 또는 완전히 제거하고 admin은
URL을 직접 알고 접근하는 것으로 문서화). `app/page.tsx`의 라우팅을 `getViewer()` 결과 기준으로 다시
쓴다: `admin`→`/admin`, `manager`(활성 회원 없음)→`/dashboard`, `manager`(활성 회원 있음) 또는
`guest`→`InterviewApp` 렌더. `isProfileComplete` 관련 분기는 호출하지 않는다(Task 4/8에서 이미
제거됨).

### Task 10: 미들웨어(`proxy.ts`) 재작성

`PROTECTED_ROUTE_PATTERNS`를 admin 전용 라우트(`/admin(.*)`, `/api/admin(.*)`)만 남기고, 나머지
패턴(`/dashboard(.*)`, `/api/dashboard(.*)`, `/api/records(.*)`, AI 문진 라우트들)은 제거해 미들웨어의
`auth.protect()` 대상에서 뺀다. 각 라우트 핸들러 자체가 `getViewer()`/`requireManager()`/세션 쿠키
확인으로 인가를 수행하도록 이미 Task 5~9에서 구현되어 있어야 한다 — 이 태스크는 미들웨어 목록만
정리한다.

### Task 11: `/sign-up`, `/complete-profile` 제거

`app/sign-up/[[...sign-up]]/page.tsx`, `app/complete-profile/`(라우트 + `CompleteProfileForm`
컴포넌트)를 삭제한다. 남은 참조(임포트, 링크, 테스트)를 정리한다. `/sign-in`은 admin 로그인용으로
남긴다.

### Task 12: 다중 파일 업로드 + 녹음 결합

`UploadPanel`을 문서 파일 입력 최대 2개(각각 이미지/PDF, `multiple` 또는 별도 슬롯 2개)와 음성 녹음
섹션을 함께 노출하도록 재작성한다. 문서나 녹음 중 최소 하나가 있어야 "분석 시작"이 활성화된다.
서버 쪽은 여러 입력을 받아 각각 `transcribeAudio`/`extractDocumentText`로 텍스트화한 뒤 순서를
보존해 하나의 문자열로 합치는 로직을 추가한다(`/api/transcribe`를 확장하거나 이를 감싸는 새 엔드포인트
신설 — 어느 쪽이든 최종적으로 클라이언트가 트리아지에 넘기는 `transcript`는 합쳐진 하나의 문자열이어야
한다). `app/api/triage/route.ts`/`app/api/specialists/route.ts`의 프로필 조회 로직(Task 8이 담당)은
건드리지 않는다 — 이 태스크는 입력 결합까지만 담당한다. 결합 로직 유닛 테스트 작성.

### Task 13: 의심질환 프리뷰 카피 조정

`SpecialtySelector`의 안내 문구를 "증상을 분석해 아래 전문분야를 추천드립니다" 류에서 의심되는
질환/증상을 더 앞세우는 한국어 존댓말 카피로 다듬는다(예: 트리아지 각 항목의 `reason` 텍스트를 더
눈에 띄게 배치). 동작(체크박스 선택, 최소 1개 필수, "문진 시작" 버튼)은 그대로 둔다.

### Task 14: Opus 5 전환

`lib/ai/models.ts`의 `TEXT_MODEL` 기본값을 `'anthropic/claude-opus-5'`로 변경한다(환경변수
오버라이드 로직은 유지).

### Task 15: 저장 흐름 갱신

`app/api/records/route.ts`의 `createRecordSchema`/핸들러를 새 스키마에 맞게 다시 쓴다: 매니저
세션의 `activeMemberId`(없으면 401/스킵), `organizationId`(매니저 세션에서), `documentTexts`(Task
12가 만든 다중 텍스트 배열), `recordingText`, `interviewRecord`, `notableFindings`(종합 소견의
`redFlags`/`overallImpression`을 요약한 문자열), `isCritical`을 받아 `lib/server/records/repository.ts`의
`createRecord`로 저장한다. `components/InterviewApp.tsx`의 `saveRecord`/`finishInterview`를
갱신해 위 필드를 보내도록 하고, 활성 회원이 없는 경우(손님)는 `/api/records` 호출 자체를 스킵한다.
`npx vitest run`/`npx tsc --noEmit`/`npm run build`가 이 태스크 완료 시점부터 다시 전부 통과해야
한다(Global Constraints 참고).

### Task 16: 매니저 대시보드 기록 조회 개선

`lib/server/records/repository.ts`의 `listRecordsForOrganization`을 `members`와 조인하는 쿼리로
바꿔 회원명을 함께 반환한다. `ManagerDashboard`의 기록 테이블에 회원명 컬럼을 추가하고, 회원별로
그룹핑(또는 최소한 회원명 기준 정렬)해 보여준다.

### Task 17: 문서 갱신

`CLAUDE.md`의 "핵심 전역 제약" 절을 이번 인증/저장 모델로 다시 쓰고 스펙/계획 문서 위치 목록에
`docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`와 이 계획 파일(플랜을
`docs/superpowers/plans/`에 복사해 커밋한 경로)을 추가한다. `harness.md`의 "회원/저장 아키텍처" 절을
매니저/회원/게스트 3계층 모델로 재작성(Clerk Organizations 의존 서술 제거). `agent.md`에 `TEXT_MODEL`
기본값 언급이 있으면 Opus 5로 갱신.

### Task 18: 최종 검증

`npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`가 전부 에러 없이 통과하는지
확인한다. 이어서 `npm run dev`로 아래 검증 방법의 수동 시나리오를 확인한다.

## 검증 방법

- 자동: 각 태스크마다 관련 유닛 테스트(세션 발급/검증, `getViewer()` 분기, 저장 API 스키마 등)를
  추가하고 `npx vitest run`으로 확인. 태스크 18에서 `tsc --noEmit`/`lint`/`build` 전체 통과 확인.
- 수동(`npm run dev`):
  1. "손님입장" → 파일 2개(이미지/PDF) + 녹음 없이도 최소 1개 입력으로 트리아지~종합 소견까지
     진행되는지, 완료 후 DB에 저장되지 않는지 확인.
  2. admin으로 로그인 → 조직 생성 → 매니저 등록(단체/전화번호/직위) 확인.
  3. 등록한 전화번호로 매니저 입장 → 대시보드에서 회원 등록(이름/전화번호/성별/연령대/직업) → 회원
     목록에 표시되는지 확인.
  4. 회원 선택 → 문진 진행(문서 2개 동시 업로드 포함) → 완료 후 대시보드로 돌아와 해당 회원 이름으로
     레코드가 조회되는지, `notableFindings`가 채워지는지 확인.
  5. 미등록 전화번호로 매니저 입장 시도 → 거부되는지 확인.
