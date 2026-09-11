# 회원/역할 기반 의료정보 저장 — 설계 문서

- 작성일: 2026-09-11
- 상태: 승인됨 (구현 계획 작성 예정)
- 용도: 개인/학습용 프로토타입의 확장 — 실제 의료 진단을 대체하지 않는다는 원칙은 유지

## 0. 이 문서가 바꾸는 것

기존 설계(`docs/superpowers/specs/2026-08-28-medical-interview-app-design.md`)와 `CLAUDE.md`의 핵심 전역
제약 중 다음 항목을 이 문서가 대체한다.

> 서버 측 영구 저장 없음: 오디오, 전사문, 문진 답변을 DB/파일/Blob에 저장하지 않는다. 로그인/회원가입도 없다.

이제 앱은 회원가입/로그인을 통해 실행되며, 로그인한 회원의 문진 결과(텍스트 형태)는 영구 저장된다.
단, **원본 오디오/이미지 파일은 여전히 저장하지 않는다** — AI가 추출한 텍스트만 저장해 민감정보 노출
범위를 최소화한다. 게스트 로그인은 기존과 동일하게 아무것도 저장하지 않는다. 이 변경은 `CLAUDE.md`/
`harness.md`/`agent.md`에도 반영되어야 하며, 구현 계획(Task)에 문서 업데이트 작업이 포함된다.

기존 7단계 문진 파이프라인(전사 → 트리아지 → 전문분야 선택 → 전문의 병렬 분석 → 문진 병합 →
통합 문진 루프 → 종합) 자체의 로직은 변경하지 않는다. 이 스펙은 그 위에 인증/저장/조회 계층을
추가하는 것이다.

## 1. 목적

1. 회원가입/로그인 없이는 앱의 회원 기능(저장·조회)을 사용할 수 없다. 이메일 + 비밀번호로 로그인하며,
   전화번호는 로그인 식별자가 아니라 가입 후 별도로 입력받는 프로필 정보다(이유는 §2 참고).
2. 회원은 소속단체에 속하고, 매니져 여부를 가질 수 있다. 관리자(admin)가 단체를 만들고 회원을 매니져로
   임명한다.
3. 회원이 문진을 완료하면 그 결과(처방전 추출 텍스트, 녹음 전사문, 문진기록표, 중대성 유무)가
   의료정보로 영구 저장된다.
4. 매니져는 자신이 속한 단체 회원들의 의료정보를 일자별로 조회할 수 있다(과거비교 특이사항, 중대성
   유무 중심).
5. 게스트로도 로그인 없이 즉시 앱을 쓸 수 있으나, 그 세션의 어떤 데이터도 서버에 저장되지 않는다
   (기존 동작 그대로).

## 2. 범위 결정 사항 (브레인스토밍에서 확정)

- **인증 방식**: 이메일 + 비밀번호(Clerk 로그인 식별자). 원래는 전화번호 + 비밀번호로 설계했으나,
  구현 착수 시점에 Clerk의 전화번호 식별자(SMS 기반 sign-up/sign-in)가 **Pro 유료 플랜 전용**
  기능임을 확인했다 — 무료(Hobby) 플랜을 유지하기로 하면서 로그인 식별자를 이메일로 바꿨다.
  전화번호는 회원가입 직후 별도 화면("전화번호 등록")에서 입력받아 Clerk 사용자의
  `unsafeMetadata.phoneNumber`에 저장한다 — Clerk의 검증된 전화번호 식별자가 아니라 일반 프로필
  필드이므로 무료 플랜에서도 제약이 없다. `medical_records.phoneNumber`는 매 저장 시 이 값을
  스냅샷으로 복사해 둔다. SMS OTP는 이번 범위에 포함하지 않는다.
- **admin/단체 생성**: 배포 시 시드 admin 계정 1개를 만들고, 이후 단체 생성과 매니져 임명은 모두 admin이
  관리 화면에서 수행한다. 일반 회원의 셀프서비스 단체 생성은 없다.
- **프론트/백엔드 분리 수준**: 단일 Next.js 저장소 내에서 `lib/server/`(백엔드)와 `app/`, `components/`
  (프론트엔드)를 계층적으로 분리한다. 별도 배포 단위로 쪼개지 않는다.
- **원본 파일 저장 여부**: 저장하지 않는다. AI가 추출한 텍스트(전사문/문서 추출 내용)만 저장한다.
- **중대성 유무 판정**: AI가 자동 판정한다. 기존 종합소견(`SynthesisReport`)의 `redFlags` 배열이
  비어있지 않으면 `isCritical = true`로 저장한다 — 별도 AI 호출을 추가하지 않는다.
- **보관 기간**: 이번 스펙에서는 삭제/보존기간 정책을 두지 않는다(기한 없이 보관). 후속 결정 사항.
- **과거비교 특이사항의 실제 산출 로직**: 이번 스펙 범위 밖이다. 컬럼만 만들고 `null`로 둔다.
  "앱 실행 시 과거 대비 자동 알림" 기능은 별도 서브프로젝트로 이 데이터가 쌓인 뒤 진행한다.
- **인증/DB 제공자**: Vercel Marketplace를 통해 Clerk(인증)와 Neon Postgres(의료정보 저장)를 사용한다.
  Clerk가 관리형으로 비밀번호 해싱·세션·무차별 대입 방지를 처리하므로 자체 구현보다 보안 리스크가
  낮다. ORM은 Drizzle(TypeScript 스키마, 기존 Zod 기반 코드베이스와 스타일이 자연스럽게 맞음)을 쓴다.

## 3. 역할 모델

Clerk가 "회원정보(전화번호, 소속단체, 매니져여부)"의 단일 진실 공급원이다 — 별도 회원 테이블을
두지 않는다. 전화번호는 Clerk의 검증된 식별자가 아니라 `unsafeMetadata.phoneNumber` 프로필 필드로
저장된다(§2 참고).

| 역할 | 판별 방법 | 권한 |
|---|---|---|
| 게스트 | Clerk 세션 없음 | 기존 클라이언트 state-only 파이프라인 그대로 사용. 서버 저장 API 호출 자체를 스킵 |
| 일반 회원 | Clerk 세션 있음, org 역할 없음 | 본인 명의 `medical_records`만 조회/생성 |
| 매니져 | Clerk 세션 + 해당 organization에서 커스텀 역할 `org:manager` | 소속 organizationId의 모든 `medical_records`를 일자별 **읽기 전용** 조회 |
| 관리자(admin) | Clerk 사용자 `publicMetadata.role === 'admin'` | 단체(Organization) 생성, 회원의 단체 배정, 매니져 역할 임명/해제. 의료정보 열람 권한은 없음 |

- 최초 admin은 로컬 1회성 스크립트(`scripts/seed-admin.ts`)가 Clerk Backend API로 지정된 이메일
  사용자에게 `publicMetadata.role = 'admin'`을 설정해 생성한다. 공개 엔드포인트로 노출하지 않는다.
- 게스트 → 회원 전환 플로우는 이번 스펙 범위 밖이다. 게스트 세션은 매번 완전히 독립적이다.
- 회원가입 직후 로그인한 사용자가 `unsafeMetadata.phoneNumber`를 아직 입력하지 않았다면, 역할에
  관계없이 "전화번호 등록" 화면으로 리다이렉트되어 이를 먼저 입력해야 앱의 나머지 기능(문진, 매니져
  대시보드, 관리자 화면 모두)에 진입할 수 있다.
- 회원가입 직후에는 어떤 단체에도 속하지 않은 상태다(admin이 아직 배정 전). 이 상태에서도 일반
  회원으로서 문진은 정상 진행되며, 저장되는 `medical_records.organizationId`는 `null`이 된다.
  admin이 나중에 단체를 배정하면 그 시점 이후 생성되는 레코드부터 새 organizationId가 붙는다 —
  과거 레코드를 소급 갱신하지는 않는다.

## 4. 데이터 모델

Neon Postgres, Drizzle 스키마. 테이블은 `medical_records` 하나만 새로 만든다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `clerkUserId` | text, indexed | 작성자(Clerk user id) |
| `organizationId` | text, nullable, indexed | 세션 당시 소속단체(Clerk org id) 스냅샷 |
| `phoneNumber` | text | 조회 편의를 위한 전화번호 비정규화 사본 |
| `recordDate` | timestamptz, default now() | 일자 |
| `prescriptionText` | text, nullable | 처방전에서 추출한 텍스트(원본 이미지 미저장) |
| `recordingText` | text, nullable | 녹음 전사문 텍스트(원본 오디오 미저장) |
| `interviewRecord` | jsonb | 문진기록표: 질의응답 목록 + 전문의 소견 + 종합소견 전체 |
| `historicalComparisonNote` | text, nullable | 과거비교 특이사항 — 이번 스펙에서는 컬럼만, 값은 null |
| `isCritical` | boolean | 중대성 유무 — `synthesis.redFlags.length > 0` |
| `createdAt` | timestamptz default now() | |

인덱스: `(organizationId, recordDate)`, `(clerkUserId, recordDate)`.

## 5. 인증/인가 강제 지점

- `proxy.ts`의 `clerkMiddleware`가 `/dashboard/**`(매니져), `/admin/**`, `/complete-profile/**`,
  `/api/records/**`, `/api/dashboard/**`, `/api/admin/**`를 보호한다.
- 매니져 조회 API는 클라이언트가 보낸 organizationId를 신뢰하지 않고, 서버에서 `auth()`로 얻은 실제
  소속단체로만 필터링한다.
- admin 전용 API는 `publicMetadata.role`을 서버에서 재확인한다(클라이언트 role 클레임 신뢰 금지).

## 6. 저장소 구조 (프론트/백엔드 논리적 분리)

```
lib/server/                    ← 백엔드 전용. 클라이언트 컴포넌트에서 import 금지(ESLint로 강제)
  db/schema.ts                    Drizzle 스키마 (medical_records)
  db/client.ts                    getDb() 지연 초기화 (Neon, 빌드 타임 크래시 방지)
  records/repository.ts           CRUD + org/user 필터링 쿼리
  auth/authorize.ts                역할 판별 헬퍼 (isManagerOf, isAdmin)

app/api/
  records/route.ts                POST(문진 완료 시 저장) / GET(본인 이력)
  dashboard/records/route.ts      GET(매니져: 소속단체 전체, 일자 필터)
  admin/organizations/route.ts    POST(단체 생성)
  admin/members/route.ts          PATCH(매니져 역할 임명/해제)

app/(app)/                     ← 프론트엔드
  page.tsx                        기존 7단계 파이프라인 (로직 변경 없음)
  sign-in/, sign-up/              Clerk 화면 (이메일+비밀번호)
  complete-profile/page.tsx       전화번호 등록(최초 로그인 시 1회, unsafeMetadata에 저장)
  dashboard/page.tsx              매니져 대시보드 (일자별 목록, 중대성/특이사항 필터)
  admin/page.tsx                  관리자 화면 (단체 생성, 매니져 임명)

proxy.ts                  clerkMiddleware + 보호 라우트 매처
```

경계 규칙: 컴포넌트/클라이언트 코드는 `lib/server/**`를 직접 import하지 않고 항상 `fetch('/api/...')`를
통해서만 접근한다.

## 7. 기존 파이프라인과의 통합 지점

통합 지점은 하나뿐이다: `app/page.tsx`의 `finishInterview`(7단계 종합 완료 직후), 게스트가 아니면
`POST /api/records`를 호출해 `{ phoneNumber, prescriptionText, recordingText, interviewRecord,
isCritical }`를 저장한다. `phoneNumber`는 로그인한 Clerk 사용자의 `unsafeMetadata.phoneNumber`에서
읽는다(§2 참고 — Clerk의 검증된 전화번호 식별자가 아니라 프로필 필드). 게스트면 이 호출을 스킵한다.
그 외 트리아지/전문의/문진/종합 로직은 변경하지 않는다.

앱 최초 진입 시 로그인/회원가입/게스트 선택 화면을 새로 추가한다. 로그인에 성공했지만
`unsafeMetadata.phoneNumber`가 아직 없으면(최초 로그인) 역할과 무관하게 "전화번호 등록" 화면으로
먼저 보낸다. 전화번호가 있으면 역할에 따라 기존 문진 화면(일반 회원) 또는 매니져 대시보드(매니져)로
분기한다. admin은 관리 화면으로 분기한다.

## 8. 보안

- 비밀번호 해싱·세션 관리·무차별 대입 방지는 Clerk에 위임한다(자체 구현하지 않는다).
- `DATABASE_URL`, `CLERK_SECRET_KEY`는 서버 전용 환경변수이며 클라이언트에 노출하지 않는다.
- 모든 `/api/records/**`, `/api/admin/**`는 서버에서 Clerk 세션을 재검증한다 — 클라이언트가 보낸
  역할/단체 claim은 신뢰하지 않는다.
- 매니져 조회는 항상 서버가 파악한 실제 소속단체로 필터링한다(다른 단체 데이터 열람 원천 차단).
- 원본 오디오/이미지 파일은 저장하지 않는다 — 텍스트만 저장해 유출 시 피해 범위를 최소화한다.
- Neon Postgres는 저장 시 암호화된다(관리형 서비스 기본 제공).
- admin 승격은 공개 API로 노출하지 않고 로컬 1회성 스크립트로만 수행한다.

## 9. 에러 처리

- Clerk/DB 환경변수 미설정 시 빌드 타임 크래시를 막기 위해 지연 초기화(`getDb()`) 패턴을 쓴다
  (Neon 클라이언트를 모듈 최상단이 아니라 함수 호출 시점에 생성).
- `/api/records` 저장 실패 시에도 이미 화면에 표시된 종합소견 결과는 그대로 유지한다 — 저장 실패는
  콘솔 로그 + 비침습적 경고 배너로만 알리고, 사용자가 방금 받은 문진 결과를 잃지 않게 한다.
- 인증/인가 실패는 401/403으로 명확히 구분해 응답한다.

## 10. 테스트

- Vitest 단위 테스트: 권한 헬퍼(`isManagerOf`, `isAdmin`), records repository의 org/user 필터링 로직,
  API 라우트 핸들러(Clerk `auth()` 모킹).
- 수동 검증: 회원가입→로그인→문진→저장 확인, 게스트 플로우(DB에 아무것도 안 쌓이는지 확인), 매니져가
  타 단체 데이터를 못 보는지, admin의 매니져 임명 플로우.

## 11. 이번 스펙에 포함하지 않는 것 (후속 서브프로젝트)

- 앱 실행 시 과거 데이터와 비교해 특이점을 먼저 알리고 필요시 문진을 시작하는 자동 비교 플로우
  (`historicalComparisonNote`를 실제로 채우는 로직) — 이 스펙으로 데이터가 쌓인 뒤 별도 스펙으로 진행.
- 전문의 에이전트 능력치 강화, 문진 종합 추론에 Opus 5 모델 사용 — `lib/agents/` 범위의 독립적인
  bounded 작업으로 별도 진행.
- 게스트 → 회원 전환, 회원의 단체 셀프 가입, SMS OTP, 데이터 보존기간/삭제 정책.
