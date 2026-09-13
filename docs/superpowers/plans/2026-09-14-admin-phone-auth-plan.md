# 관리자 전화번호 기반 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk-based admin login with the same phone-number-only session model managers already use, and remove `@clerk/nextjs` from the codebase entirely.

**Architecture:** Add an `admins` table mirroring `managers` (no `organizationId` — admin is a global role). Extend the existing `hd_session` JWT cookie's payload to a discriminated union (`{role:'manager',...}` | `{role:'admin',...}`), add `createAdminSession`, and rewrite `getViewer()` to read only that cookie (no more Clerk `auth()`/`clerkClient()` calls). Add `/admin-entry` + `POST /api/admin-entry` mirroring `/manager-entry` + `POST /api/manager-entry`, generalizing the existing entry-form component so both routes share it. Delete the Clerk middleware, sign-in page, and package once nothing references them.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (Neon Postgres), `jose` (JWT), Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-admin-phone-auth-design.md`

## Global Constraints

- UI 문구와 에러 메시지는 한국어 존댓말로 작성한다.
- 세션 쿠키 이름(`hd_session`)과 서명 방식(JWT/`jose`, HS256, `SESSION_SECRET`, 30일 만료)은 변경하지 않는다 — 페이로드 셰이프만 확장한다.
- admin 승격(관리자 row 생성)은 공개 API로 노출하지 않고 로컬 스크립트(`npm run seed:admin`)로만 수행한다.
- admin 인증은 매니저와 동일하게 비밀번호/PIN/OTP 없이 전화번호만으로 처리한다(개인/학습용 프로토타입 전제의 의도된 낮은 보안 수준).
- `/api/admin-entry`에도 `/api/manager-entry`와 동일하게 IP당 5분/10회 rate limit을 적용한다.
- `requireAdmin`/`requireManager`/`requireMember`의 함수 시그니처와 호출부는 변경하지 않는다 — 내부 구현만 Clerk 제거로 바뀐다.

---

### Task 1: `admins` 테이블을 스키마에 추가

**Files:**
- Modify: `lib/server/db/schema.ts`
- Test: `tests/lib/server/db/schema.test.ts`

**Interfaces:**
- Produces: `admins` (Drizzle table), `Admin` (`typeof admins.$inferSelect`), `NewAdmin` (`typeof admins.$inferInsert`) — columns `id: string`, `phoneNumber: string`, `name: string`, `createdAt: Date`

- [ ] **Step 1: Write the failing test**

`tests/lib/server/db/schema.test.ts`의 import 목록에 `admins`를 추가하고, 파일 맨 아래에 새 describe 블록을 추가한다.

```ts
import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { organizations, managers, members, medicalRecords, admins } from '@/lib/server/db/schema';
```

```ts
describe('admins schema', () => {
  it('defines the expected columns', () => {
    const columns = Object.keys(getTableColumns(admins));
    expect(columns).toEqual(['id', 'phoneNumber', 'name', 'createdAt']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/server/db/schema.test.ts`
Expected: FAIL — `admins` is not exported from `@/lib/server/db/schema` (TypeScript/import error).

- [ ] **Step 3: Implement the schema addition**

`lib/server/db/schema.ts`에 `organizations` 다음, `managers` 앞에 추가한다(매니저와 달리 조직에 속하지 않는 전역 역할이라 `organizationId`가 없다):

```ts
export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneNumber: text('phone_number').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

파일 하단 타입 export 목록(`Organization`/`NewOrganization` 옆)에 추가:

```ts
export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/server/db/schema.test.ts`
Expected: PASS (all describe blocks, including the new `admins schema` one)

- [ ] **Step 5: Commit**

```bash
git add lib/server/db/schema.ts tests/lib/server/db/schema.test.ts
git commit -m "feat: add admins table to schema"
```

---

### Task 2: Admin 리포지토리 (조회/생성)

**Files:**
- Create: `lib/server/admins/repository.ts`

**Interfaces:**
- Consumes: `admins`, `Admin`, `NewAdmin` (from Task 1, `@/lib/server/db/schema`), `getDb` (`@/lib/server/db/client`)
- Produces: `findAdminByPhoneNumber(phoneNumber: string): Promise<Admin | null>`, `createAdmin(input: NewAdmin): Promise<Admin>`

이 프로젝트는 `lib/server/organizations/repository.ts`(같은 패턴의 `findManagerByPhoneNumber`/`createManager`)에도 전용 단위 테스트가 없다 — 이 얇은 DB 래퍼들은 이를 모킹하는 라우트 테스트(Task 5)로 간접 검증되는 게 기존 관행이다. 이 태스크는 타입체크로 검증한다.

- [ ] **Step 1: 파일 작성**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { admins, type Admin, type NewAdmin } from '@/lib/server/db/schema';

export async function findAdminByPhoneNumber(phoneNumber: string): Promise<Admin | null> {
  const db = getDb();
  const [row] = await db.select().from(admins).where(eq(admins.phoneNumber, phoneNumber));
  return row ?? null;
}

export async function createAdmin(input: NewAdmin): Promise<Admin> {
  const db = getDb();
  const [row] = await db.insert(admins).values(input).returning();
  return row;
}
```

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (기존 에러가 있었다면 그 목록과 동일해야 함 — 이 파일 관련 에러가 없어야 함)

- [ ] **Step 3: Commit**

```bash
git add lib/server/admins/repository.ts
git commit -m "feat: add admin repository lookup/create functions"
```

---

### Task 3: 세션 페이로드를 admin/manager 유니언 타입으로 확장

**Files:**
- Modify: `lib/server/auth/session.ts`
- Test: `tests/lib/server/auth/session.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈, `next/headers`의 `cookies`, `jose`만 사용)
- Produces: `SessionPayload` (유니언: `{role:'manager', managerId, organizationId, activeMemberId?}` | `{role:'admin', adminId}`), `createAdminSession(adminId: string): Promise<void>`, 기존 `createManagerSession`/`readSession`/`encodeSessionToken`/`decodeSessionToken`/`setActiveMember`/`clearActiveMember`는 시그니처 동일 유지

- [ ] **Step 1: Write the failing tests**

`tests/lib/server/auth/session.test.ts`의 import에 `createAdminSession` 추가:

```ts
import {
  encodeSessionToken,
  decodeSessionToken,
  createManagerSession,
  createAdminSession,
  setActiveMember,
  clearActiveMember,
  readSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from '@/lib/server/auth/session';
```

`encodeSessionToken / decodeSessionToken` describe 블록 안, 기존 라운드트립 테스트들 옆에 추가:

```ts
  it('round-trips an admin payload', async () => {
    const payload: SessionPayload = { role: 'admin', adminId: 'admin-1' };
    const token = await encodeSessionToken(payload);
    const decoded = await decodeSessionToken(token);
    expect(decoded).toEqual(payload);
  });
```

파일 하단, `createManagerSession` describe 블록 다음에 새 describe 블록 추가:

```ts
describe('createAdminSession', () => {
  it('sets a signed session cookie with the expected flags', async () => {
    await createAdminSession('admin-1');

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, token, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    const decoded = await decodeSessionToken(token);
    expect(decoded).toEqual({ role: 'admin', adminId: 'admin-1' });
  });
});
```

`setActiveMember`와 `clearActiveMember` describe 블록에 각각 admin 세션 거부 케이스 추가:

```ts
  it('throws when the session belongs to an admin, not a manager', async () => {
    const token = await encodeSessionToken({ role: 'admin', adminId: 'admin-1' });
    cookieStore.get.mockReturnValue({ value: token });

    await expect(setActiveMember('member-1')).rejects.toThrow();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
```

```ts
  it('throws when the session belongs to an admin, not a manager', async () => {
    const token = await encodeSessionToken({ role: 'admin', adminId: 'admin-1' });
    cookieStore.get.mockReturnValue({ value: token });

    await expect(clearActiveMember()).rejects.toThrow();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/server/auth/session.test.ts`
Expected: FAIL — `createAdminSession` is not exported; admin payload round-trip fails `isSessionPayload` (only accepts `role:'manager'` today).

- [ ] **Step 3: Implement**

`lib/server/auth/session.ts` 전체를 다음으로 교체한다:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type SessionPayload =
  | { role: 'manager'; managerId: string; organizationId: string; activeMemberId?: string }
  | { role: 'admin'; adminId: string };

export const SESSION_COOKIE_NAME = 'hd_session';

// 30일 — 시설에 비치된 태블릿/키오스크형 기기에서 로그인 상태를 유지하는 용도이므로
// 방문 세션이 아니라 긴 만료 기간을 사용한다.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET 환경 변수가 설정되지 않았습니다.');
  }
  return new TextEncoder().encode(secret);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.role === 'admin') {
    return typeof candidate.adminId === 'string';
  }

  if (candidate.role === 'manager') {
    if (typeof candidate.managerId !== 'string' || typeof candidate.organizationId !== 'string') {
      return false;
    }
    if (candidate.activeMemberId !== undefined && typeof candidate.activeMemberId !== 'string') {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 세션 페이로드를 서명된 JWT 문자열로 인코딩한다. Next.js 요청 컨텍스트 없이 순수하게
 * 동작하므로 유닛 테스트에서 직접 호출할 수 있다.
 *
 * @param options.expiresAt 만료 시각을 직접 지정한다(테스트에서 만료된 토큰을 만들 때 사용).
 *   생략하면 발급 시점으로부터 `SESSION_MAX_AGE_SECONDS` 뒤로 설정된다.
 */
export async function encodeSessionToken(
  payload: SessionPayload,
  options?: { expiresAt?: Date }
): Promise<string> {
  const expiresAt = options?.expiresAt ?? new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());
}

/**
 * 서명된 JWT 문자열을 검증하고 세션 페이로드로 디코딩한다. 서명 위조, 형식 오류, 만료 등
 * 어떤 사유로든 검증에 실패하면 예외를 던지지 않고 `null`을 반환한다.
 */
export async function decodeSessionToken(token: string): Promise<SessionPayload | null> {
  // getSecretKey()는 try 밖에서 호출한다 — SESSION_SECRET 미설정은 "세션 없음/무효"가
  // 아니라 배포 설정 오류이므로, 아래 catch에 흡수되어 null로 뭉개지면 안 된다.
  const secretKey = getSecretKey();
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (!isSessionPayload(payload)) {
      return null;
    }
    if (payload.role === 'admin') {
      return { role: 'admin', adminId: payload.adminId };
    }
    const result: SessionPayload = {
      role: 'manager',
      managerId: payload.managerId,
      organizationId: payload.organizationId,
    };
    if (payload.activeMemberId !== undefined) {
      result.activeMemberId = payload.activeMemberId;
    }
    return result;
  } catch {
    return null;
  }
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    // 이 앱은 Vercel(HTTPS)에만 배포되므로 환경과 무관하게 항상 secure 쿠키를 사용한다.
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * 매니저 로그인 성공 시 서명된 세션 쿠키를 발급한다.
 */
export async function createManagerSession(managerId: string, organizationId: string): Promise<void> {
  const token = await encodeSessionToken({ role: 'manager', managerId, organizationId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 관리자 로그인 성공 시 서명된 세션 쿠키를 발급한다.
 */
export async function createAdminSession(adminId: string): Promise<void> {
  const token = await encodeSessionToken({ role: 'admin', adminId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 현재 요청의 세션 쿠키를 검증해 페이로드를 반환한다. 쿠키가 없거나 검증에 실패하면
 * `null`을 반환한다(로그인하지 않은 정상적인 상태이므로 예외를 던지지 않는다).
 */
export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return decodeSessionToken(token);
}

/**
 * 매니저가 특정 회원을 선택했을 때 세션에 활성 회원을 기록한다. 유효한 매니저 세션이
 * 없으면(세션이 없거나 admin 세션이면) 예외를 던진다(호출 전에 라우트 핸들러가 매니저 인증을
 * 확인했어야 한다).
 */
export async function setActiveMember(memberId: string): Promise<void> {
  const session = await readSession();
  if (!session || session.role !== 'manager') {
    throw new Error('활성 매니저 세션이 없습니다.');
  }
  const token = await encodeSessionToken({ ...session, activeMemberId: memberId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 세션에서 활성 회원 선택을 해제한다. 유효한 매니저 세션이 없으면 예외를 던진다.
 */
export async function clearActiveMember(): Promise<void> {
  const session = await readSession();
  if (!session || session.role !== 'manager') {
    throw new Error('활성 매니저 세션이 없습니다.');
  }
  const token = await encodeSessionToken({
    role: 'manager',
    managerId: session.managerId,
    organizationId: session.organizationId,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/lib/server/auth/session.test.ts`
Expected: PASS (all cases, including new admin ones)

- [ ] **Step 5: Commit**

```bash
git add lib/server/auth/session.ts tests/lib/server/auth/session.test.ts
git commit -m "feat: extend session payload to support admin role"
```

---

### Task 4: `authorize.ts`에서 Clerk 제거

**Files:**
- Modify: `lib/server/auth/authorize.ts`
- Test: `tests/lib/server/auth/authorize.test.ts` (전체 재작성)

**Interfaces:**
- Consumes: `readSession` (Task 3, `@/lib/server/auth/session`)
- Produces: `Viewer = { role: 'guest'|'admin'|'manager'; organizationId: string | null; adminId?: string; managerId?: string; activeMemberId?: string }`, `getViewer()`, `requireAdmin()`, `requireManager()`, `requireMember()`, `AuthorizationError` — 함수 시그니처는 기존과 동일, `Viewer`에서 `userId` 필드는 제거되고 `adminId`로 대체(다른 파일에서 `.userId`를 읽는 곳이 없음을 확인함)

- [ ] **Step 1: Write the failing test (전체 재작성)**

`tests/lib/server/auth/authorize.test.ts`를 다음으로 교체한다:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const readSessionMock = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  readSession: () => readSessionMock(),
}));

import { getViewer, requireAdmin, requireManager, requireMember, AuthorizationError } from '@/lib/server/auth/authorize';

describe('getViewer', () => {
  beforeEach(() => {
    readSessionMock.mockReset();
  });

  it('returns guest role when there is no session', async () => {
    readSessionMock.mockResolvedValue(null);
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', organizationId: null });
  });

  it('returns admin role for an admin session', async () => {
    readSessionMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1' });
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'admin', organizationId: null, adminId: 'admin_1' });
  });

  it('returns manager role with no active member when the session has none', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
    });
    expect('activeMemberId' in viewer).toBe(false);
  });

  it('returns manager role with activeMemberId when the session has one selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    const viewer = await getViewer();
    expect(viewer).toEqual({
      role: 'manager',
      organizationId: 'org_1',
      managerId: 'manager_1',
      activeMemberId: 'member_1',
    });
  });
});

describe('requireAdmin', () => {
  it('throws AuthorizationError when viewer is not admin', async () => {
    readSessionMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is admin', async () => {
    readSessionMock.mockResolvedValue({ role: 'admin', adminId: 'admin_1' });
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin', adminId: 'admin_1' });
  });
});

describe('requireManager', () => {
  it('throws AuthorizationError for guests', async () => {
    readSessionMock.mockResolvedValue(null);
    await expect(requireManager()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is a manager with an organization', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    await expect(requireManager()).resolves.toMatchObject({ role: 'manager', organizationId: 'org_1' });
  });
});

describe('requireMember', () => {
  it('throws AuthorizationError for guests', async () => {
    readSessionMock.mockResolvedValue(null);
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for a manager with no active member selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
    });
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('resolves for a manager with an active member selected', async () => {
    readSessionMock.mockResolvedValue({
      role: 'manager',
      managerId: 'manager_1',
      organizationId: 'org_1',
      activeMemberId: 'member_1',
    });
    await expect(requireMember()).resolves.toMatchObject({ role: 'manager', activeMemberId: 'member_1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/server/auth/authorize.test.ts`
Expected: FAIL — 현재 `authorize.ts`는 `@clerk/nextjs/server`를 import하는데 이 테스트가 그 모듈을 mock하지 않으므로 실제 Clerk 호출을 시도하다 실패하거나, `getViewer()`가 admin 세션 페이로드(`{role:'admin', adminId}`)를 인식하지 못해 guest를 반환한다.

- [ ] **Step 3: Implement**

`lib/server/auth/authorize.ts` 전체를 다음으로 교체한다:

```ts
import { readSession } from '@/lib/server/auth/session';

export type ViewerRole = 'guest' | 'admin' | 'manager';

export type Viewer = {
  role: ViewerRole;
  organizationId: string | null;
  adminId?: string;
  managerId?: string;
  activeMemberId?: string;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const session = await readSession();

  if (session?.role === 'admin') {
    return { role: 'admin', organizationId: null, adminId: session.adminId };
  }

  if (session?.role === 'manager') {
    const viewer: Viewer = {
      role: 'manager',
      organizationId: session.organizationId,
      managerId: session.managerId,
    };
    if (session.activeMemberId !== undefined) {
      viewer.activeMemberId = session.activeMemberId;
    }
    return viewer;
  }

  return { role: 'guest', organizationId: null };
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    throw new AuthorizationError('admin 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireManager(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'manager' || !viewer.organizationId) {
    throw new AuthorizationError('매니저 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireMember(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer.role !== 'manager' || !viewer.activeMemberId) {
    throw new AuthorizationError('선택된 회원이 없습니다.');
  }
  return viewer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/server/auth/authorize.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm run test`
Expected: PASS — `tests/api/admin-managers.test.ts`는 `requireAdmin`을 직접 모킹하므로 이 변경의 영향을 받지 않아야 한다. `tests/lib/server/auth/patientProfile.test.ts`도 `readSession`만 모킹하므로 영향 없어야 한다.

- [ ] **Step 6: Commit**

```bash
git add lib/server/auth/authorize.ts tests/lib/server/auth/authorize.test.ts
git commit -m "refactor: drop Clerk from getViewer, use session cookie for admin role"
```

---

### Task 5: `POST /api/admin-entry` 라우트

**Files:**
- Create: `app/api/admin-entry/route.ts`
- Test: `tests/api/admin-entry.test.ts`

**Interfaces:**
- Consumes: `findAdminByPhoneNumber` (Task 2, `@/lib/server/admins/repository`), `createAdminSession` (Task 3, `@/lib/server/auth/session`), `checkRateLimit`/`getClientIp` (`@/lib/server/rateLimit`), `parseJsonBody` (`@/lib/server/http`)
- Produces: `POST` handler — 200 `{ success: true }` / 404 `{ error }` / 429 `{ error }` / 400 `{ error }`

- [ ] **Step 1: Write the failing test**

`tests/api/admin-entry.test.ts` 신규 작성 (기존 `tests/api/manager-entry.test.ts`와 동일한 패턴):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findAdminByPhoneNumberMock = vi.fn();
const createAdminSessionMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/lib/server/admins/repository', () => ({
  findAdminByPhoneNumber: (phoneNumber: string) => findAdminByPhoneNumberMock(phoneNumber),
}));

vi.mock('@/lib/server/auth/session', () => ({
  createAdminSession: (adminId: string) => createAdminSessionMock(adminId),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: (key: string, limit: number, windowMs: number) =>
    checkRateLimitMock(key, limit, windowMs),
  getClientIp: () => '203.0.113.1',
}));

import { POST } from '@/app/api/admin-entry/route';
import { jsonRequest as jsonRequestTo } from '@/tests/helpers/request';

function jsonRequest(body: unknown) {
  return jsonRequestTo('http://localhost/api/admin-entry', body);
}

describe('POST /api/admin-entry', () => {
  beforeEach(() => {
    findAdminByPhoneNumberMock.mockReset();
    createAdminSessionMock.mockReset();
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
  });

  it('returns 429 and skips lookup when the rate limit is exceeded', async () => {
    checkRateLimitMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ phoneNumber: '010-1234-5678' }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data).toEqual({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).toHaveBeenCalledWith('admin-entry:203.0.113.1', expect.any(Number), expect.any(Number));
  });

  it('creates an admin session and succeeds for a registered phone number', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue({
      id: 'admin_1',
      phoneNumber: '010-1234-5678',
      name: '홍길동',
      createdAt: new Date(),
    });

    const response = await POST(jsonRequest({ phoneNumber: '010-1234-5678' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(createAdminSessionMock).toHaveBeenCalledWith('admin_1');
  });

  it('returns 404 and does not create a session for an unregistered phone number', async () => {
    findAdminByPhoneNumberMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ phoneNumber: '010-0000-0000' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: '등록되지 않은 전화번호입니다.' });
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies with 400', async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: '요청 형식이 올바르지 않습니다.' });
    expect(findAdminByPhoneNumberMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/admin-entry.test.ts`
Expected: FAIL — `@/app/api/admin-entry/route`가 존재하지 않음

- [ ] **Step 3: Implement**

`app/api/admin-entry/route.ts` 신규 작성:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSession } from '@/lib/server/auth/session';
import { findAdminByPhoneNumber } from '@/lib/server/admins/repository';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { parseJsonBody } from '@/lib/server/http';

const adminEntrySchema = z.object({
  phoneNumber: z.string().min(1),
});

// 전화번호가 유일한 자격 증명이므로(비밀번호/OTP 없음) 스크립트로 번호를 무차별 대입하는 것을
// 최소한이라도 막는다 — IP당 5분에 10회.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(`admin-entry:${clientIp}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = adminEntrySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const admin = await findAdminByPhoneNumber(parsed.data.phoneNumber);
  if (!admin) {
    return NextResponse.json({ error: '등록되지 않은 전화번호입니다.' }, { status: 404 });
  }

  await createAdminSession(admin.id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/admin-entry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin-entry/route.ts tests/api/admin-entry.test.ts
git commit -m "feat: add POST /api/admin-entry route"
```

---

### Task 6: `/admin-entry` 화면 + 폼 컴포넌트 일반화

**Files:**
- Create: `components/PhoneEntryForm.tsx`
- Create: `app/admin-entry/page.tsx`
- Modify: `app/manager-entry/page.tsx`
- Delete: `components/ManagerEntryForm.tsx`

**Interfaces:**
- Consumes: `POST /api/admin-entry`(Task 5), `POST /api/manager-entry`(기존)
- Produces: `PhoneEntryForm({ title, description, apiPath, redirectPath }: PhoneEntryFormProps)` — 재사용 가능한 전화번호 입장 폼

이 컴포넌트들은 이 저장소에 컴포넌트 단위 테스트가 없는 영역(React Testing Library 미설치, 기존 `ManagerEntryForm.tsx`도 무테스트)이므로, 검증은 타입체크 + Task 11의 수동 브라우저 확인으로 한다.

- [ ] **Step 1: `components/PhoneEntryForm.tsx` 신규 작성**

기존 `components/ManagerEntryForm.tsx`를 제목/설명/API 경로/이동 경로를 props로 받도록 일반화한다:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type PhoneEntryFormProps = {
  title: string;
  description: string;
  apiPath: string;
  redirectPath: string;
};

export function PhoneEntryForm({ title, description, apiPath, redirectPath }: PhoneEntryFormProps) {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      if (response.ok) {
        router.push(redirectPath);
        return;
      }

      if (response.status === 404) {
        const data = await response.json();
        setError(data.error ?? '등록되지 않은 전화번호입니다.');
      } else {
        setError('입장에 실패했습니다.');
      }
      setSubmitting(false);
    } catch {
      setError('입장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-label-alternative">{description}</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          전화번호
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="010-1234-5678"
            required
            className="rounded-8 border border-line-normal p-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
        >
          입장
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: `app/manager-entry/page.tsx` 수정**

```tsx
import { PhoneEntryForm } from '@/components/PhoneEntryForm';

export default function ManagerEntryPage() {
  return (
    <PhoneEntryForm
      title="매니저 입장"
      description="등록된 전화번호를 입력해주세요."
      apiPath="/api/manager-entry"
      redirectPath="/dashboard"
    />
  );
}
```

- [ ] **Step 3: `app/admin-entry/page.tsx` 신규 작성**

```tsx
import { PhoneEntryForm } from '@/components/PhoneEntryForm';

export default function AdminEntryPage() {
  return (
    <PhoneEntryForm
      title="관리자 입장"
      description="등록된 관리자 전화번호를 입력해주세요."
      apiPath="/api/admin-entry"
      redirectPath="/admin"
    />
  );
}
```

- [ ] **Step 4: `components/ManagerEntryForm.tsx` 삭제**

```bash
rm components/ManagerEntryForm.tsx
```

- [ ] **Step 5: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `ManagerEntryForm` import가 남아있는 곳이 없어야 함)

- [ ] **Step 6: Commit**

```bash
git add components/PhoneEntryForm.tsx app/admin-entry/page.tsx app/manager-entry/page.tsx
git rm components/ManagerEntryForm.tsx
git commit -m "feat: add /admin-entry screen, generalize phone entry form"
```

---

### Task 7: Clerk 미들웨어 삭제

**Files:**
- Delete: `proxy.ts`
- Delete: `tests/proxy.test.ts`

**Interfaces:** 없음 (다른 어떤 파일도 `proxy.ts`를 import하지 않음 — `app/admin/page.tsx`, `app/api/admin/organizations/route.ts`, `app/api/admin/managers/route.ts` 모두 이미 자체적으로 `requireAdmin`/`getViewer`를 호출해 인가를 수행하고 있음을 확인했다)

- [ ] **Step 1: 파일 삭제**

```bash
rm proxy.ts tests/proxy.test.ts
```

- [ ] **Step 2: 전체 테스트 스위트로 검증**

Run: `npm run test`
Expected: PASS (더 이상 `tests/proxy.test.ts`가 없으므로 해당 스위트는 목록에서 사라짐, 다른 실패 없음)

- [ ] **Step 3: Commit**

```bash
git add -u proxy.ts tests/proxy.test.ts
git commit -m "refactor: remove Clerk middleware, admin routes already self-guard"
```

---

### Task 8: `ClerkProvider` 및 `/sign-in` 삭제

**Files:**
- Modify: `app/layout.tsx`
- Delete: `app/sign-in/[[...sign-in]]/page.tsx` (및 빈 디렉터리)

**Interfaces:** 없음

- [ ] **Step 1: `app/layout.tsx`에서 `ClerkProvider` 제거**

`import { ClerkProvider } from "@clerk/nextjs";` 줄을 삭제하고, `<ClerkProvider>...</ClerkProvider>` 래핑을 벗겨낸다. 결과:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { InstallButton } from "@/components/InstallButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "홈 닥터",
  description: "통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "홈 닥터",
  },
};

export const viewport: Viewport = {
  themeColor: "#0066FF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DisclaimerBanner />
        <div className="flex justify-end px-4 py-2">
          <InstallButton />
        </div>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: `/sign-in` 디렉터리 삭제**

```bash
rm -rf "app/sign-in"
```

(`app/sign-up`는 이번 작업 이전 세션에서 이미 삭제됨 — 남아있다면 함께 삭제)

- [ ] **Step 3: 전체 테스트 스위트 + 타입체크로 검증**

Run: `npm run test && npx tsc --noEmit`
Expected: PASS, 에러 없음

- [ ] **Step 4: Commit**

```bash
git add -A app/layout.tsx app/sign-in
git commit -m "refactor: remove ClerkProvider and /sign-in route"
```

---

### Task 9: `seed-admin.ts`를 DB 직접 insert 방식으로 재작성

**Files:**
- Modify: `scripts/seed-admin.ts`

**Interfaces:**
- Consumes: `createAdmin` (Task 2, `../lib/server/admins/repository`)

- [ ] **Step 1: 파일 재작성**

```ts
import 'dotenv/config';
import { createAdmin } from '../lib/server/admins/repository';

const POSTGRES_UNIQUE_VIOLATION = '23505';

async function main() {
  const phoneNumber = process.argv[2];
  const name = process.argv[3];
  if (!phoneNumber || !name) {
    console.error('사용법: npm run seed:admin -- <전화번호> <이름>');
    process.exit(1);
  }

  try {
    const admin = await createAdmin({ phoneNumber, name });
    console.log(`관리자 ${admin.name}(${admin.phoneNumber})을 등록했습니다.`);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      console.error(`이미 등록된 전화번호입니다: ${phoneNumber}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`@/` 경로 별칭 대신 상대 경로(`../lib/...`)를 쓴다 — 기존 `seed-admin.ts`는 별칭이 필요 없는 패키지(`@clerk/nextjs/server`)만 import했으므로, `tsx` 단독 실행 컨텍스트에서 `@/` 별칭 해석이 검증된 적이 없다. 상대 경로는 항상 동작한다.

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-admin.ts
git commit -m "refactor: seed-admin inserts directly into admins table instead of Clerk"
```

---

### Task 10: `@clerk/nextjs` 의존성 및 환경변수 정리

**Files:**
- Modify: `package.json` (및 `package-lock.json`)
- Modify (수동, git 추적 안 됨): `.env.local`

**Interfaces:** 없음

- [ ] **Step 1: 잔여 참조 확인**

Run: `grep -rn "@clerk" --include=*.ts --include=*.tsx app components lib scripts tests proxy.ts 2>/dev/null`
Expected: 아무 결과 없음 (Task 4, 7, 8에서 모두 제거됨). 결과가 있다면 그 파일을 먼저 정리한다.

- [ ] **Step 2: 패키지 제거**

Run: `npm uninstall @clerk/nextjs`

- [ ] **Step 3: `.env.local`에서 Clerk 변수 제거 (수동, .gitignore 대상이라 git에는 안 잡힘)**

`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` 네 줄을 삭제한다.

- [ ] **Step 4: 전체 테스트 스위트 + 타입체크 + 빌드로 검증**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: 모두 PASS/성공 (빌드는 `DATABASE_URL`/`SESSION_SECRET` 등 런타임 환경변수가 없어도 `getDb()`의 지연 초기화 패턴 덕분에 성공해야 한다 — 실패하면 어떤 모듈이 top-level에서 이 값들을 요구하는지 확인)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @clerk/nextjs dependency"
```

---

### Task 11: 최종 검증 (DB 마이그레이션 + 수동 확인)

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 새 테이블을 실제 DB에 반영**

Run: `npm run db:push`
Expected: drizzle-kit이 `admins` 테이블 생성 계획을 보여주고 적용 — 기존 테이블/데이터에는 영향 없는 추가(additive) 마이그레이션이어야 한다. 실행 전 diff 내용을 확인한다.

- [ ] **Step 2: 최초 관리자 등록**

Run: `npm run seed:admin -- <실제 전화번호> <이름>` (예: `npm run seed:admin -- 01012345678 홍길동`)
Expected: "관리자 홍길동(01012345678)을 등록했습니다." 출력

- [ ] **Step 3: 개발 서버로 수동 확인**

Run: `npm run dev`

1. `/admin-entry` 접속 → 방금 등록한 전화번호 입력 → `/admin`으로 이동하는지 확인
2. `/admin`에서 조직 생성 → 매니저 등록(전화번호+직위)이 기존과 동일하게 동작하는지 확인
3. 등록되지 않은 전화번호로 `/admin-entry` 시도 → "등록되지 않은 전화번호입니다" 거부 확인
4. `/sign-in`, `/sign-up` 접속 → 404 확인 (라우트 삭제 반영)
5. `/manager-entry`가 기존과 동일하게 동작하는지 확인 (회귀 없음)

- [ ] **Step 4: 최종 전체 테스트 재실행**

Run: `npm run test`
Expected: 전체 PASS

이 태스크는 커밋을 만들지 않는다(검증 전용). 위 확인이 모두 끝나면 이번 기능 브랜치는 통합 준비가 된 것이다.
