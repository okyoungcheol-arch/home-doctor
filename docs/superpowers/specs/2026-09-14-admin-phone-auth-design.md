# 관리자 전화번호 기반 인증 — 설계 문서

- 작성일: 2026-09-14
- 상태: 설계 확정 (구현 계획 작성 예정)
- 용도: 개인/학습용 프로토타입의 관리자 로그인 방식 단순화

## 0. 이 문서가 바꾸는 것

`docs/superpowers/specs/2026-09-13-manager-member-phone-auth-design.md`와 `CLAUDE.md`의 다음 항목을 대체한다.

> 관리자는 지금도 Clerk 이메일+비밀번호 로그인(`publicMetadata.role === 'admin'`)이다.

이제 관리자(admin)도 매니저(manager)와 동일하게 **전화번호만으로 세션을 획득**한다. Clerk는 이 프로젝트에서 admin 인증에만 쓰이던 유일한 용도였으므로, 이번 변경으로 `@clerk/nextjs` 의존성 자체를 저장소에서 완전히 제거한다.

## 1. 목적

1. 로컬 개발/개인 사용 환경에서 Clerk 프로젝트 설정, 이메일 인증, 비밀번호 정책 등 외부 서비스 의존 없이 관리자로 진입할 수 있게 한다.
2. 관리자·매니저·손님 3계층 권한 모델과 각 라우트의 인가 로직(`requireAdmin`/`requireManager`/`requireMember`)은 그대로 유지한다 — 바뀌는 것은 "admin임을 어떻게 증명하는가" 뿐이다.
3. 최초 admin 계정을 만들 수 있는 부트스트랩 경로(로컬 스크립트)를 제공한다.

## 2. 범위 결정 사항

- **admin 인증 보안 수준**: 매니저와 동일하게 전화번호만으로 허용(비밀번호/PIN/OTP 없음). CLAUDE.md에 이미 명시된 "개인/학습용 프로토타입 전제의 낮은 보안 수준" 방침을 admin에도 동일 적용한다.
- **admin은 조직에 속하지 않는 전역 역할**: 매니저와 달리 `organizationId`가 없다. 기존 `AdminPanel`이 모든 조직을 대상으로 조직 생성/매니저 등록을 수행하는 것과 일치한다.
- **Clerk 완전 제거**: 패키지, 환경변수, `/sign-in`·`/sign-up` 라우트, `ClerkProvider`, `seed-admin.ts`의 Clerk 호출을 모두 제거한다. 이 프로젝트에서 Clerk를 쓰는 곳은 admin 인증뿐이었다.
- **최초 admin 등록**: 웹 UI가 아니라 로컬 스크립트(`npm run seed:admin`)로 DB에 직접 admin row를 insert한다. 매니저 등록이 "admin이 이미 로그인한 상태에서 웹으로 등록"인 것과 달리, admin 자신은 최초 진입 시 아무도 로그인해 있지 않으므로 웹 UI로는 만들 수 없다.

## 3. 역할 모델 (변경 후)

| 역할 | 인증 방식 | 판별 | 권한 |
|---|---|---|---|
| 관리자(admin) | 전화번호(자체 서명 쿠키) | `admins` 테이블 조회, JWT 쿠키 검증 | 조직 생성, 매니저 등록, 매니저 목록 조회 |
| 매니저(manager) | 전화번호(자체 서명 쿠키) | `managers` 테이블 조회, JWT 쿠키 검증 | 기존과 동일 |
| 회원(member) | 매니저가 선택 | 매니저 세션의 `activeMemberId` | 기존과 동일 |
| 손님(guest) | 없음 | 세션 쿠키 없음 | 기존과 동일 |

admin과 manager 모두 동일한 `hd_session` 쿠키 메커니즘을 쓰되, 페이로드의 `role` 값으로 구분된다.

## 4. 데이터 모델

### 신규 테이블

```ts
export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneNumber: text('phone_number').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`managers`와 달리 `organizationId`가 없다(전역 역할). 마이그레이션은 `npm run db:push`(drizzle-kit)로 적용한다.

## 5. 인증/세션 모델

### 세션 페이로드 (역할별 유니언 타입으로 변경)

`lib/server/auth/session.ts`의 `SessionPayload`:

```ts
export type SessionPayload =
  | { role: 'manager'; managerId: string; organizationId: string; activeMemberId?: string }
  | { role: 'admin'; adminId: string };
```

- `createAdminSession(adminId)`를 `createManagerSession`과 나란히 추가한다.
- `encodeSessionToken`/`decodeSessionToken`/`readSession`은 역할에 따라 다른 셰이프를 다루도록 타입 가드(`isSessionPayload`)를 확장한다.
- 쿠키 이름(`hd_session`), 서명 방식(HS256, `SESSION_SECRET`), 만료(30일)는 그대로 재사용한다.

### 역할 판별 (`lib/server/auth/authorize.ts`)

`getViewer()`에서 Clerk 호출(`auth()`, `clerkClient`)을 제거하고 `readSession()` 결과만으로 분기한다.

1. `readSession()`이 `role: 'admin'` 페이로드 반환 → **`admin`**
2. `readSession()`이 `role: 'manager'` 페이로드 반환 → **`manager`** (+ `activeMemberId` 있으면 함께 노출)
3. 그 외 → **`guest`**

`requireAdmin`/`requireManager`/`requireMember`의 시그니처와 호출부는 변경하지 않는다.

### 미들웨어 정리

`proxy.ts`는 Clerk 미들웨어로 `/admin(.*)`, `/api/admin(.*)` 보호가 유일한 역할이었다. 아래 라우트들이 이미 각자 `guard(requireAdmin, ...)`을 호출해 자체적으로 인가를 수행하고 있으므로(코드 확인 완료), 미들웨어 보호 없이도 안전하다.

- `app/admin/page.tsx` — `getViewer()`로 role 확인 후 미admin이면 `/`로 redirect
- `app/api/admin/organizations/route.ts` — POST/GET 모두 `guard(requireAdmin, ...)`
- `app/api/admin/managers/route.ts` — POST에서 `guard(requireAdmin, ...)`

**`proxy.ts` 파일 자체를 삭제**한다. Clerk 미들웨어 외에 다른 책임이 없었기 때문이다.

## 6. 화면/라우팅 구조

### 신규: `/admin-entry`

`/manager-entry`와 동일한 패턴.

- **`app/admin-entry/page.tsx`**: 전화번호 입력 폼
- **`POST /api/admin-entry`**: `admins` 테이블에서 전화번호 조회 → 있으면 `createAdminSession(admin.id)` 발급 → 없으면 404 `등록되지 않은 전화번호입니다.`
  - `manager-entry/route.ts`와 동일하게 IP당 5분/10회 rate limit 적용 (`checkRateLimit`, `getClientIp`)
- 성공 시 `/admin`으로 이동

### 폼 컴포넌트 통합 (작은 리팩터링)

현재 `components/ManagerEntryForm.tsx`는 제목/설명/API 경로/이동 경로가 하드코딩되어 있다. 이를 `components/PhoneEntryForm.tsx`로 일반화하고 다음 props를 받도록 한다.

```ts
type PhoneEntryFormProps = {
  title: string;          // "매니저 입장" | "관리자 입장"
  description: string;
  apiPath: string;        // '/api/manager-entry' | '/api/admin-entry'
  redirectPath: string;   // '/dashboard' | '/admin'
};
```

`app/manager-entry/page.tsx`와 신규 `app/admin-entry/page.tsx`가 각각 다른 props로 이 컴포넌트를 사용한다. `ManagerEntryForm.tsx`는 삭제한다.

### 삭제되는 라우트

- `app/sign-in/[[...sign-in]]/`
- `app/sign-up/[[...sign-up]]/`

### 최초 화면 (WelcomeScreen)

변경 없음 — admin 진입 링크는 기존처럼 일반 사용자 동선에 노출하지 않고 URL 직접 접근(`/admin-entry`)으로만 문서화한다.

## 7. 최초 admin 등록 (부트스트랩)

`scripts/seed-admin.ts`를 Clerk API 호출 대신 Drizzle로 `admins` 테이블에 직접 insert하도록 재작성한다.

```
npm run seed:admin -- 01012345678 홍길동
```

- 인자: 전화번호(필수), 이름(필수)
- 전화번호 중복 시 에러 메시지 출력 후 종료 (기존 `POSTGRES_UNIQUE_VIOLATION` 처리 패턴과 동일)
- 이 스크립트는 공개 API가 아니라 로컬 실행 전용이며, 이 점은 기존 스펙의 "admin 승격은 공개 API 아님" 보안 원칙과 동일하다.

## 8. Clerk 제거 대상

- `package.json`의 `@clerk/nextjs` 의존성 제거 (`npm uninstall @clerk/nextjs`)
- `app/layout.tsx`의 `<ClerkProvider>` 제거
- `.env.local`/`.env.local.example`의 `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` 제거
- `proxy.ts` 삭제 (5절 참조)
- `app/sign-in/`, `app/sign-up/` 삭제 (6절 참조)
- `scripts/seed-admin.ts` 재작성 (7절 참조)
- 테스트의 Clerk mock 제거: `tests/lib/server/auth/authorize.test.ts`, `tests/lib/server/auth/session.test.ts` 등에서 `@clerk/nextjs/server` mock을 걷어내고 새 세션 모델 기준으로 재작성

## 9. 보안

- **admin**: 매니저와 동일하게 전화번호만으로 인증 (낮은 보안 수준, 개인 프로토타입 전제) — 실제 운영 배포 시엔 OTP/재인증 강화 필요
- **admin-entry rate limit**: `manager-entry`와 동일하게 IP당 5분/10회로 전화번호 무차별 대입 최소 방지
- **쿠키**: 기존과 동일 (HttpOnly, secure, 자체 서명 JWT)
- **admin 테이블 조회는 전역**(조직 필터링 없음) — 매니저 조회처럼 소속 단체로 제한할 필요가 없다
- **admin 승격(row 생성)은 공개 API가 아니며 로컬 스크립트로만 수행** (기존 원칙 유지, 대상만 Clerk → DB로 변경)

## 10. 테스트

### 자동 테스트 (Vitest)

- 세션 유틸: `createAdminSession` 발급 → `readSession`으로 admin 페이로드 읽기, 위조/만료 쿠키 거부 (기존 manager 케이스와 대칭)
- `getViewer()`: admin/manager/guest 분기 (Clerk mock 제거, 세션 쿠키만으로 테스트)
- `requireAdmin()`: admin 세션 있을 때 통과, manager/guest일 때 `AuthorizationError`
- `POST /api/admin-entry`: 등록된 전화번호 성공, 미등록 404, rate limit 429
- 기존 `/api/admin/managers`, `/api/admin/organizations` 테스트는 admin 세션 발급 방식만 Clerk mock → `createAdminSession` 호출로 교체

### 수동 검증 (`npm run dev`)

1. `npm run seed:admin -- <전화번호> <이름>` 실행 → `admins` 테이블에 row 생성 확인
2. `/admin-entry`에서 그 전화번호 입력 → `/admin`으로 이동 확인
3. `/admin`에서 조직 생성 → 매니저 등록 (기존 플로우 그대로 동작 확인)
4. 등록되지 않은 전화번호로 `/admin-entry` 시도 → 거부 확인
5. `/sign-in`, `/sign-up` 접속 시 404 확인 (라우트 삭제 반영)

## 11. 이번 스펙에 포함하지 않는 것

- **admin 다중 계정 간 권한 차등**: 모든 admin은 동일한 전역 권한을 가진다. 역할 세분화는 범위 밖.
- **강화 인증(OTP 등)**: 실제 운영 배포 시 별도 작업.
- **admin 계정 삭제/비활성화 API**: 필요 시 로컬 스크립트나 직접 DB 조작으로 처리하며, 이번 스펙에는 웹 UI를 포함하지 않는다.
