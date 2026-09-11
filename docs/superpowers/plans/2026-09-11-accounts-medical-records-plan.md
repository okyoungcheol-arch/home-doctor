# 회원/역할 기반 의료정보 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clerk 기반 회원가입/로그인(이메일+비밀번호, 전화번호는 가입 후 프로필로 별도 등록), 역할
(관리자/매니져/일반회원/게스트), Neon Postgres에 문진 결과를 영구 저장하는 기능, 매니져 대시보드,
관리자 화면을 기존 7단계 문진 파이프라인 위에 얹는다.

**Architecture:** Clerk가 회원정보(이메일/전화번호/소속단체/매니져여부)의 단일 진실 공급원이 된다. Neon
Postgres(Drizzle ORM)에는 `medical_records` 테이블 하나만 두고 의료정보(텍스트만, 원본 파일 없음)를
저장한다. `lib/server/**`는 백엔드 전용 계층(클라이언트 컴포넌트에서 import 금지)이며, `app/api/**`
라우트를 통해서만 접근한다. 기존 7단계 파이프라인 로직은 변경하지 않고, 문진 완료 시점에 저장 호출
하나를 추가하는 방식으로 통합한다.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Clerk(`@clerk/nextjs`), Neon
Postgres(`@neondatabase/serverless`) + Drizzle(`drizzle-orm`, `drizzle-kit`), Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`

## Global Constraints

- 원본 오디오/이미지 파일은 저장하지 않는다 — AI가 추출한 텍스트만 저장한다 (스펙 §2, §8).
- 서버는 클라이언트가 보낸 역할(role)/소속단체(organizationId) 값을 절대 신뢰하지 않는다. 항상
  `getViewer()`가 Clerk 세션에서 서버 사이드로 도출한 값만 사용한다 (스펙 §5, §8).
- 게스트(Clerk 세션 없음)는 `/api/records`를 호출하지 않는다 — 어떤 것도 서버에 저장되지 않는다
  (스펙 §3).
- Clerk/Neon 클라이언트는 지연 초기화한다 — 모듈 최상단에서 `process.env`를 즉시 읽어 초기화하면
  환경변수가 없는 빌드 타임에 `next build`가 크래시한다.
- UI 문구는 모두 한국어 존댓말로 작성한다 (`CLAUDE.md`).
- 자동 테스트는 이 코드베이스의 기존 관례를 따른다: 로직/API 라우트는 Vitest로 테스트하고(기존
  `tests/api/*`, `tests/lib/*` 패턴), UI 컴포넌트(`components/**`, `app/**/page.tsx`의 화면 자체)는
  자동 테스트를 작성하지 않고 브라우저 수동 검증으로 확인한다 — 기존 코드베이스에 컴포넌트 테스트가
  전혀 없다는 사실과 일치시킨다.
- `medical_records` repository 함수(`lib/server/records/repository.ts`)는 실제 Neon DB 없이는
  Drizzle 쿼리 빌더 체인을 신뢰성 있게 모킹하기 어려우므로 전용 유닛 테스트를 두지 않는다. 대신
  이 함수를 호출하는 API 라우트 테스트에서 repository 자체를 모킹해 인가 로직(누가 무엇을 볼 수
  있는가)을 검증한다 — 보안 리스크가 실제로 있는 지점이 바로 그 인가 로직이기 때문이다. repository는
  Task 1에서 프로비저닝한 실제 Neon 개발 DB로 수동 검증한다.
- **범위 밖 UX 단순화**: 관리자가 매니져를 임명하려면 대상 회원의 Clerk User ID를 알아야 한다(Clerk
  대시보드에서 확인). 이번 범위에서는 회원 검색/목록 UI를 만들지 않는다 — 스펙에 명시되지 않은
  추가 기능이라 YAGNI.
- **로그인 식별자는 이메일이지 전화번호가 아니다.** Clerk의 전화번호 식별자(SMS 기반 sign-up/sign-in)는
  Pro 유료 플랜 전용이라, 무료 플랜을 유지하기 위해 이메일+비밀번호로 로그인하도록 바꿨다(스펙 §2).
  전화번호는 회원가입 직후 "전화번호 등록" 화면(Task 9)에서 입력받아 `user.unsafeMetadata.phoneNumber`
  (일반 프로필 필드, Clerk의 검증된 식별자 아님)에 저장하고, `medical_records` 저장 시 이 값을
  스냅샷으로 복사한다. `scripts/seed-admin.ts`(Task 16)도 전화번호가 아니라 이메일로 사용자를 찾는다.
- **매니져 역할은 `org:admin`(Clerk 기본 제공 역할)이지, 커스텀 역할 `org:admin`가 아니다.** Clerk의
  Custom roles 기능도 Pro 유료 플랜 전용이라("Plan upgrade required" 안내로 확인됨), 무료 플랜에 원래
  있는 두 org 역할(`org:admin`, `org:member`) 중 `org:admin`을 매니져로 재사용한다(스펙 §3). 이
  `org:admin`은 Clerk **조직 범위** 역할이고, 우리 시스템의 **전역** admin(`publicMetadata.role ===
  'admin'`)과는 완전히 다른 개념이다 — 코드에서 `getViewer()`가 이 둘을 구분해서 판별하므로 헷갈릴
  일은 없지만, 커밋 메시지나 리뷰에서 언급할 때는 "조직 org:admin(매니져)"처럼 명시한다.

---

## Task 1: Clerk와 Neon Postgres 프로비저닝 (수동 설정)

이 태스크는 코드가 아니라 계정/대시보드 설정이다. 사람이 직접 수행해야 하며, 이후 모든 태스크가
여기서 만들어지는 환경변수에 의존한다.

**Files:** 없음 (계정 설정) — 완료 후 `.env.local`이 생성된다.

- [ ] **Step 1: Vercel CLI 설치 확인**

```bash
npm i -g vercel
vercel --version
```

- [ ] **Step 2: 프로젝트 링크**

```bash
vercel link
```

- [ ] **Step 3: Clerk 통합 설치**

```bash
vercel integration add clerk --yes
```

브라우저 인증/클레임 단계가 뜨면 완료할 때까지 기다린다(Connectable 통합).

- [ ] **Step 4: Clerk 대시보드에서 이메일+비밀번호 인증 확인**

Clerk 대시보드 → Configure → User & authentication에서 Email 탭의 "Sign-up with email"/"Sign-in
with email"과 Password 탭이 켜져 있는지 확인한다(둘 다 무료 플랜 기본값으로 이미 켜져 있을 가능성이
높다 — 꺼져 있을 때만 켠다). **Phone 탭은 건드리지 않는다** — "Sign-up with phone"/"Sign-in with
phone"은 Clerk Pro 유료 플랜 전용이라, 로그인 식별자로 쓰지 않기로 했다(스펙 §2, Global Constraints
참고). 전화번호는 Task 9의 "전화번호 등록" 화면에서 `unsafeMetadata`로 별도 수집한다.

- [ ] **Step 5: Clerk 대시보드에서 Organizations 기능 활성화**

Clerk 대시보드 → Organizations → Settings에서 "Enable organizations"를 누른다. **커스텀 역할은
만들지 않는다** — Clerk의 Custom roles 기능도 Pro 유료 플랜 전용이라("Plan upgrade required" 안내로
확인됨), 무료 플랜에 기본 제공되는 두 역할(`org:admin`, `org:member`) 중 `org:admin`을 그대로
"매니져"로 재사용하기로 했다(Global Constraints 참고). 우리 시스템의 전역 admin
(`publicMetadata.role === 'admin'`)과는 이름만 같을 뿐 별개 개념이므로 코드/커밋 메시지에서
헷갈리지 않도록 "조직 org:admin(매니져)"처럼 구분해 부른다. Roles & Permissions 화면에서는 아무것도
바꾸지 않는다.

- [ ] **Step 6: Neon Postgres 통합 설치**

```bash
vercel integration add neon --yes
```

- [ ] **Step 7: 환경변수 로컬로 가져오기**

```bash
vercel env pull .env.local --yes
```

`.env.local`에 `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `DATABASE_URL`이 채워졌는지
확인한다.

- [ ] **Step 8: 시드 admin으로 쓸 이메일 결정**

Task 16(seed-admin 스크립트)에서 이 이메일로 가입한 사용자를 최초 관리자로 지정한다(로그인 식별자가
이메일이므로 — Global Constraints 참고). 팀/본인이 실제 로그인에 쓸 이메일을 정해 기록해 둔다
(코드에는 커밋하지 않는다 — 스크립트 실행 시 인자로 전달).

---

## Task 2: Drizzle 스키마와 DB 클라이언트

**Files:**
- Create: `lib/server/db/schema.ts`
- Create: `lib/server/db/client.ts`
- Create: `drizzle.config.ts`
- Test: `tests/lib/server/db/schema.test.ts`
- Modify: `package.json` (dependencies/devDependencies, scripts)

**Interfaces:**
- Produces: `medicalRecords` (Drizzle table), `MedicalRecord`/`NewMedicalRecord` types, `getDb(): Db`
  — 이후 모든 태스크가 이 세 가지를 그대로 가져다 쓴다.

- [ ] **Step 1: 패키지 설치**

```bash
npm install @clerk/nextjs @neondatabase/serverless drizzle-orm
npm install -D drizzle-kit dotenv-cli dotenv
```

- [ ] **Step 2: 실패하는 스키마 테스트 작성**

`tests/lib/server/db/schema.test.ts`:

```ts
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
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `npm test -- tests/lib/server/db/schema.test.ts`
Expected: FAIL — `lib/server/db/schema.ts`가 없어서 모듈을 찾을 수 없다는 에러.

- [ ] **Step 4: 스키마 구현**

`lib/server/db/schema.ts`:

```ts
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
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `npm test -- tests/lib/server/db/schema.test.ts`
Expected: PASS

- [ ] **Step 6: DB 클라이언트(지연 초기화) 구현**

`lib/server/db/client.ts`:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

export function getDb(): Db {
  if (!cached) {
    const sql = neon(process.env.DATABASE_URL!);
    cached = drizzle(sql, { schema });
  }
  return cached;
}
```

- [ ] **Step 7: drizzle-kit 설정 및 npm 스크립트 추가**

`drizzle.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

`package.json`의 `scripts`에 추가:

```json
"db:push": "dotenv -e .env.local -- drizzle-kit push"
```

- [ ] **Step 8: 실제 Neon DB에 테이블 생성(수동 검증)**

```bash
npm run db:push
```

Neon 대시보드 또는 `psql`로 `medical_records` 테이블이 생성됐는지 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add lib/server/db package.json package-lock.json drizzle.config.ts tests/lib/server/db
git commit -m "feat: add medical_records Drizzle schema and lazy DB client"
```

---

## Task 3: Clerk Proxy와 Provider 연결

Next.js 16에서 `middleware.ts` 파일 컨벤션은 deprecated되어 `proxy.ts`로 이름이 바뀌었다(동작은
동일, 파일명과 익스포트 이름만 바뀜 — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
참고). 이 프로젝트는 Next 16이므로 `middleware.ts`가 아니라 `proxy.ts`를 만든다.

**Files:**
- Create: `proxy.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: 없음 (Task 1에서 만든 `CLERK_SECRET_KEY`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 환경변수)
- Produces: 이후 모든 페이지에서 `@clerk/nextjs`의 `useUser()`/`auth()` 사용 가능

- [ ] **Step 1: Proxy 작성**

`proxy.ts` (저장소 루트 — `middleware.ts`가 아니다):

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/admin(.*)',
  '/complete-profile(.*)',
  '/api/records(.*)',
  '/api/dashboard(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 2: `app/layout.tsx`에 `ClerkProvider` 추가**

`app/layout.tsx`의 기존 내용에서 `<body>` 내부를 `<ClerkProvider>`로 감싼다:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
  title: "다중 전문의 AI 문진",
  description: "통화 녹음, 처방전 등 이미지·PDF 파일을 분석하고 여러 전문의 AI 에이전트가 문진해 종합 소견을 제공하는 개인용 프로토타입입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI 문진",
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
        <ClerkProvider>
          <DisclaimerBanner />
          <div className="flex justify-end px-4 py-2">
            <InstallButton />
          </div>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 수동 검증**

```bash
npm run dev
```

아무 페이지나 열어 콘솔에 Clerk 관련 에러가 없는지 확인한다(아직 로그인 화면은 없으므로 기존
문진 화면이 그대로 뜨는지만 확인).

- [ ] **Step 4: 커밋**

```bash
git add proxy.ts app/layout.tsx
git commit -m "feat: wire up Clerk proxy and provider"
```

---

## Task 4: 인가(Authorization) 헬퍼

**Files:**
- Create: `lib/server/auth/authorize.ts`
- Test: `tests/lib/server/auth/authorize.test.ts`

**Interfaces:**
- Produces: `type Viewer = { role: 'guest' | 'admin' | 'manager' | 'member'; userId: string | null;
  organizationId: string | null }`, `getViewer(): Promise<Viewer>`, `class AuthorizationError extends
  Error`, `requireAdmin(): Promise<Viewer>`, `requireManager(): Promise<Viewer>`,
  `requireMember(): Promise<Viewer>` — Task 6, 8, 11, 13, 14가 이 다섯 가지를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/server/auth/authorize.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: getUserMock } }),
}));

import { getViewer, requireAdmin, requireManager, requireMember, AuthorizationError } from '@/lib/server/auth/authorize';

describe('getViewer', () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserMock.mockReset();
  });

  it('returns guest role when there is no session', async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    const viewer = await getViewer();
    expect(viewer).toEqual({ role: 'guest', userId: null, organizationId: null });
  });

  it('returns admin role when publicMetadata.role is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    const viewer = await getViewer();
    expect(viewer.role).toBe('admin');
  });

  it('returns manager role when orgRole is org:admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: 'org_1', orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    const viewer = await getViewer();
    expect(viewer.role).toBe('manager');
    expect(viewer.organizationId).toBe('org_1');
  });

  it('returns member role otherwise', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    const viewer = await getViewer();
    expect(viewer.role).toBe('member');
  });
});

describe('requireAdmin', () => {
  it('throws AuthorizationError when viewer is not admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireAdmin()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is admin', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' });
  });
});

describe('requireManager', () => {
  it('throws AuthorizationError when viewer has no organization', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: null, orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireManager()).rejects.toThrow(AuthorizationError);
  });

  it('resolves when viewer is a manager with an organization', async () => {
    authMock.mockResolvedValue({ userId: 'user_2', orgId: 'org_1', orgRole: 'org:admin' });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireManager()).resolves.toMatchObject({ role: 'manager', organizationId: 'org_1' });
  });
});

describe('requireMember', () => {
  it('throws AuthorizationError for guests', async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    await expect(requireMember()).rejects.toThrow(AuthorizationError);
  });

  it('resolves for any signed-in viewer', async () => {
    authMock.mockResolvedValue({ userId: 'user_3', orgId: null, orgRole: null });
    getUserMock.mockResolvedValue({ publicMetadata: {} });
    await expect(requireMember()).resolves.toMatchObject({ role: 'member', userId: 'user_3' });
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/lib/server/auth/authorize.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

`lib/server/auth/authorize.ts`:

```ts
import { auth, clerkClient } from '@clerk/nextjs/server';

export type ViewerRole = 'guest' | 'admin' | 'manager' | 'member';

export type Viewer = {
  role: ViewerRole;
  userId: string | null;
  organizationId: string | null;
};

export class AuthorizationError extends Error {}

export async function getViewer(): Promise<Viewer> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return { role: 'guest', userId: null, organizationId: null };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = (user.publicMetadata as { role?: string } | null | undefined)?.role === 'admin';

  if (isAdmin) {
    return { role: 'admin', userId, organizationId: orgId ?? null };
  }
  if (orgRole === 'org:admin') {
    return { role: 'manager', userId, organizationId: orgId ?? null };
  }
  return { role: 'member', userId, organizationId: orgId ?? null };
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
    throw new AuthorizationError('매니져 권한이 필요합니다.');
  }
  return viewer;
}

export async function requireMember(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.userId) {
    throw new AuthorizationError('로그인이 필요합니다.');
  }
  return viewer;
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/lib/server/auth/authorize.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/server/auth tests/lib/server/auth
git commit -m "feat: add role-based authorization helpers"
```

---

## Task 5: 의료정보 Repository

**Files:**
- Create: `lib/server/records/repository.ts`

**Interfaces:**
- Consumes: `medicalRecords`, `NewMedicalRecord`(Task 2), `getDb()`(Task 2)
- Produces: `createRecord(input: NewMedicalRecord): Promise<MedicalRecord>`,
  `listRecordsForUser(clerkUserId: string): Promise<MedicalRecord[]>`,
  `listRecordsForOrganization(organizationId: string): Promise<MedicalRecord[]>` — Task 6, 8이 이
  세 함수를 그대로 가져다 쓴다. (전용 유닛 테스트 없음 — Global Constraints 참고. Task 6, 8에서
  이 모듈 전체를 모킹해 인가 로직을 검증한다.)

- [ ] **Step 1: 구현**

`lib/server/records/repository.ts`:

```ts
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { medicalRecords, type MedicalRecord, type NewMedicalRecord } from '@/lib/server/db/schema';

export async function createRecord(input: NewMedicalRecord): Promise<MedicalRecord> {
  const db = getDb();
  const [row] = await db.insert(medicalRecords).values(input).returning();
  return row;
}

export async function listRecordsForUser(clerkUserId: string): Promise<MedicalRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.clerkUserId, clerkUserId))
    .orderBy(desc(medicalRecords.recordDate));
}

export async function listRecordsForOrganization(organizationId: string): Promise<MedicalRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.organizationId, organizationId))
    .orderBy(desc(medicalRecords.recordDate));
}
```

- [ ] **Step 2: 수동 검증**

Task 2에서 만든 `npm run db:push`로 생성된 실제 Neon DB를 대상으로 임시 스크립트나 `psql`로 한 행을
넣고 세 함수가 기대한 대로 동작하는지 로컬에서 한 번 호출해 확인한다(이 검증은 Task 6에서 API
라우트를 붙인 뒤 브라우저로 end-to-end 확인하는 것으로 갈음해도 된다).

- [ ] **Step 3: 커밋**

```bash
git add lib/server/records
git commit -m "feat: add medical records repository"
```

---

## Task 6: `POST`/`GET /api/records`

**Files:**
- Create: `app/api/records/route.ts`
- Test: `tests/api/records.test.ts`

**Interfaces:**
- Consumes: `requireMember`(Task 4), `createRecord`/`listRecordsForUser`(Task 5)
- Produces: `POST /api/records` (body: `{ phoneNumber, prescriptionText, recordingText,
  interviewRecord, isCritical }` → `{ record }`), `GET /api/records` (→ `{ records }`) — Task 10이
  `POST /api/records`를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api/records.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireMemberMock = vi.fn();
const createRecordMock = vi.fn();
const listRecordsForUserMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireMember: () => requireMemberMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/records/repository', () => ({
  createRecord: (input: unknown) => createRecordMock(input),
  listRecordsForUser: (id: string) => listRecordsForUserMock(id),
}));

import { POST, GET } from '@/app/api/records/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/records', () => {
  beforeEach(() => {
    requireMemberMock.mockReset();
    createRecordMock.mockReset();
  });

  it('returns 401 when the caller is a guest', async () => {
    requireMemberMock.mockRejectedValue(new Error('not signed in'));
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(401);
    expect(createRecordMock).not.toHaveBeenCalled();
  });

  it('creates a record scoped to the server-derived viewer', async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: 'org_1' });
    createRecordMock.mockResolvedValue({ id: 'rec_1' });

    const response = await POST(
      jsonRequest({
        phoneNumber: '010-1234-5678',
        prescriptionText: null,
        recordingText: '전사문',
        interviewRecord: { qaLog: [] },
        isCritical: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_1', organizationId: 'org_1' }),
    );
  });

  it('rejects malformed bodies', async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: null });
    const response = await POST(jsonRequest({ phoneNumber: '010-0000-0000' }));
    expect(response.status).toBe(400);
    expect(createRecordMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/records', () => {
  beforeEach(() => {
    requireMemberMock.mockReset();
    listRecordsForUserMock.mockReset();
  });

  it('returns 401 for guests', async () => {
    requireMemberMock.mockRejectedValue(new Error('not signed in'));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the caller's own records", async () => {
    requireMemberMock.mockResolvedValue({ role: 'member', userId: 'user_1', organizationId: null });
    listRecordsForUserMock.mockResolvedValue([{ id: 'rec_1' }]);
    const response = await GET();
    const data = await response.json();
    expect(data.records).toEqual([{ id: 'rec_1' }]);
    expect(listRecordsForUserMock).toHaveBeenCalledWith('user_1');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/api/records.test.ts`
Expected: FAIL — 라우트 모듈이 없음.

- [ ] **Step 3: 구현**

`app/api/records/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/server/auth/authorize';
import { createRecord, listRecordsForUser } from '@/lib/server/records/repository';

const createRecordSchema = z.object({
  phoneNumber: z.string().min(1),
  prescriptionText: z.string().nullable().optional(),
  recordingText: z.string().nullable().optional(),
  interviewRecord: z.record(z.string(), z.unknown()),
  isCritical: z.boolean(),
});

export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await requireMember();
  } catch {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const record = await createRecord({
    clerkUserId: viewer.userId!,
    organizationId: viewer.organizationId,
    phoneNumber: parsed.data.phoneNumber,
    prescriptionText: parsed.data.prescriptionText ?? null,
    recordingText: parsed.data.recordingText ?? null,
    interviewRecord: parsed.data.interviewRecord,
    isCritical: parsed.data.isCritical,
  });

  return NextResponse.json({ record });
}

export async function GET() {
  let viewer;
  try {
    viewer = await requireMember();
  } catch {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const records = await listRecordsForUser(viewer.userId!);
  return NextResponse.json({ records });
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/api/records.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/records tests/api/records.test.ts
git commit -m "feat: add POST/GET /api/records"
```

---

## Task 7: `/api/transcribe`가 업로드 종류(kind)를 함께 반환하도록 확장

의료정보 저장 시 "처방전 텍스트"와 "녹음 텍스트"를 구분해서 넣으려면, 어떤 업로드였는지(오디오
vs 문서) 클라이언트가 알아야 한다.

**Files:**
- Modify: `app/api/transcribe/route.ts`
- Modify: `tests/api/transcribe.test.ts`
- Modify: `components/UploadPanel.tsx`

**Interfaces:**
- Produces: `/api/transcribe` 응답에 `kind: 'audio' | 'document'` 필드 추가.
  `UploadPanel`의 `onComplete` 시그니처가 `(transcript: string, kind: 'audio' | 'document') => void`로
  변경됨 — Task 9(`InterviewApp`)이 이 새 시그니처를 사용한다.

- [ ] **Step 1: 기존 테스트에 kind 검증 추가(실패하는 상태로 수정)**

`tests/api/transcribe.test.ts`의 각 `it` 블록에 아래처럼 `data.kind` 검증을 추가한다(파일 전체를
다시 쓴다):

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/transcription', () => ({
  transcribeAudio: vi.fn(async () => ({ text: '테스트 전사', language: 'ko', durationInSeconds: 3 })),
}));

vi.mock('@/lib/ai/documentExtraction', () => ({
  extractDocumentText: vi.fn(async () => ({ text: '처방전 분석 결과' })),
}));

import { POST } from '@/app/api/transcribe/route';

describe('POST /api/transcribe', () => {
  it('transcribes an uploaded audio file', async () => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'test.webm', { type: 'audio/webm' }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('테스트 전사');
    expect(data.kind).toBe('audio');
  });

  it('extracts text from an uploaded image file', async () => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'prescription.png', { type: 'image/png' }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('처방전 분석 결과');
    expect(data.kind).toBe('document');
  });

  it('extracts text from an uploaded PDF file', async () => {
    const formData = new FormData();
    formData.append(
      'audio',
      new File([new Uint8Array([1, 2, 3])], 'result.pdf', { type: 'application/pdf' }),
    );

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('처방전 분석 결과');
    expect(data.kind).toBe('document');
  });

  it('returns 400 for an unsupported file type', async () => {
    const formData = new FormData();
    formData.append('audio', new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' }));

    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when no file is provided', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/transcribe', { method: 'POST', body: formData });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/api/transcribe.test.ts`
Expected: FAIL — `data.kind`가 `undefined`.

- [ ] **Step 3: 라우트 수정**

`app/api/transcribe/route.ts`:

```ts
import { transcribeAudio } from '@/lib/ai/transcription';
import { extractDocumentText } from '@/lib/ai/documentExtraction';

export const maxDuration = 60;

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('audio');

  if (!(file instanceof File)) {
    return Response.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (file.type.startsWith('audio/')) {
      const result = await transcribeAudio(buffer);
      return Response.json({ ...result, kind: 'audio' as const });
    }

    if (file.type.startsWith('image/') || isPdf(file)) {
      const mediaType = isPdf(file) ? 'application/pdf' : file.type;
      const result = await extractDocumentText({ data: buffer, mediaType, filename: file.name });
      return Response.json({ ...result, kind: 'document' as const });
    }

    return Response.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
  } catch (error) {
    console.error('transcribe error', error);
    return Response.json({ error: '파일을 텍스트로 변환하지 못했습니다.' }, { status: 502 });
  }
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/api/transcribe.test.ts`
Expected: PASS

- [ ] **Step 5: `UploadPanel`이 kind를 함께 전달하도록 수정**

`components/UploadPanel.tsx` 전체를 아래로 교체한다:

```tsx
'use client';

import { useRef, useState, type ChangeEvent } from 'react';

type UploadKind = 'audio' | 'document';

type UploadPanelProps = {
  onComplete: (transcript: string, kind: UploadKind) => void;
};

export function UploadPanel({ onComplete }: UploadPanelProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function transcribeAndComplete(audio: File | Blob, filename: string) {
    setStatus('uploading');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('audio', audio, filename);

    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('전사 요청이 실패했습니다.');
      const data = await response.json();
      onComplete(data.text, data.kind as UploadKind);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    transcribeAndComplete(file, file.name);
  }

  async function startRecording() {
    setErrorMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage('마이크 접근 권한이 필요합니다.');
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      transcribeAndComplete(blob, 'recording.webm');
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  const busy = status === 'uploading' || isRecording;

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">파일 업로드 또는 마이크 녹음</h2>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="audio/*,image/*,.pdf,application/pdf"
          disabled={busy}
          onChange={handleFileChange}
          className="text-sm disabled:opacity-50"
        />

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={status === 'uploading'}
          className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {isRecording ? '녹음 중지' : '마이크로 녹음'}
        </button>
      </div>

      {isRecording && <p className="text-sm text-label-alternative">녹음 중입니다...</p>}
      {status === 'uploading' && <p className="text-sm text-label-alternative">전사 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">{errorMessage}</p>}
    </div>
  );
}
```

- [ ] **Step 6: 커밋**

```bash
git add app/api/transcribe/route.ts tests/api/transcribe.test.ts components/UploadPanel.tsx
git commit -m "feat: distinguish audio vs document uploads via kind field"
```

---

## Task 8: 기존 파이프라인을 `InterviewApp` 컴포넌트로 추출하고 저장 연동

**Files:**
- Create: `components/InterviewApp.tsx`
- Modify: `app/page.tsx` (Task 10에서 서버 컴포넌트 라우팅으로 다시 바뀐다 — 이번 태스크에서는 우선
  `InterviewApp`을 그대로 렌더링하는 클라이언트 페이지로 유지해 회귀 여부를 확인한다)

**Interfaces:**
- Consumes: `UploadPanel`의 새 `onComplete(transcript, kind)` 시그니처(Task 7). `mode === 'member'`일
  때 저장할 `phoneNumber`는 `useUser()`가 반환하는 `user.unsafeMetadata.phoneNumber`에서 읽는다 —
  Task 10이 이 값이 없는 로그인 사용자를 `/complete-profile`(Task 9)로 먼저 보내므로, `InterviewApp`이
  `mode="member"`로 렌더링되는 시점에는 항상 채워져 있다고 가정한다.
- Produces: `InterviewApp({ mode: 'member' | 'guest' })` — Task 10의 라우팅 페이지들이 이 컴포넌트를
  `mode` prop과 함께 렌더링한다.

- [ ] **Step 1: `components/InterviewApp.tsx` 생성**

기존 `app/page.tsx`의 로직을 그대로 옮기되, 아래 변경을 반영한다:
- `'use client'` 유지, `useUser`(Clerk) import 추가
- `mode: 'member' | 'guest'` prop 추가
- 업로드 종류(`uploadKind`)와 문진 질의응답 로그(`qaLog`)를 state로 추적
- `finishInterview` 성공 후 `mode === 'member'`면 `saveRecord` 호출
- 저장 실패 시에도 화면의 종합소견은 그대로 유지하고 비침습적 경고만 표시(`saveWarning` state)

```tsx
'use client';

import { useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { UploadPanel } from '@/components/UploadPanel';
import { InterviewChat, type AnswerAttachment } from '@/components/InterviewChat';
import { SpecialistCard } from '@/components/SpecialistCard';
import { SynthesisReport } from '@/components/SynthesisReport';
import { SpecialtySelector, type TriageSpecialty } from '@/components/SpecialtySelector';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { EmergencyBanner } from '@/components/EmergencyBanner';
import { mergeQuestions, normalize, isSimilar, type QueuedQuestion } from '@/lib/interview/mergeQuestions';
import type { SpecialistOpinion, SynthesisReport as SynthesisReportType } from '@/lib/ai/schemas';

type Stage =
  | 'upload'
  | 'triaging'
  | 'selecting-specialties'
  | 'consulting'
  | 'interview'
  | 'synthesizing'
  | 'report';

type UploadKind = 'audio' | 'document';
type QaLogEntry = { question: string; answer: string };

// Hard cap on total questions asked in one interview, so a model that keeps re-emitting
// follow-up questions (even after dedup) cannot keep the interview loop running forever.
const MAX_TOTAL_QUESTIONS = 15;

type InterviewAppProps = {
  mode: 'member' | 'guest';
};

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.error === 'string') return data.error;
  } catch {
    // response body wasn't JSON or didn't have an `error` field; fall through to generic message
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

export function InterviewApp({ mode }: InterviewAppProps) {
  const { user } = useUser();
  const [stage, setStage] = useState<Stage>('upload');
  const [transcript, setTranscript] = useState('');
  const [uploadKind, setUploadKind] = useState<UploadKind | null>(null);
  const [triageSpecialties, setTriageSpecialties] = useState<TriageSpecialty[]>([]);
  const [opinions, setOpinions] = useState<SpecialistOpinion[]>([]);
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([]);
  const [qaLog, setQaLog] = useState<QaLogEntry[]>([]);
  const [report, setReport] = useState<SynthesisReportType | null>(null);
  const [emergencyFlags, setEmergencyFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  // Bumped by handleReset so any async handler still in flight (fetches can take up to
  // maxDuration = 60s) can tell its own session has been abandoned and skip its setState calls.
  const sessionIdRef = useRef(0);

  async function handleTranscribed(text: string, kind: UploadKind) {
    setError(null);
    setTranscript(text);
    setUploadKind(kind);
    setAnsweredQuestions([]);
    setQaLog([]);
    setStage('triaging');
    const sessionId = sessionIdRef.current;

    try {
      const triageResponse = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      });
      if (!triageResponse.ok) throw new Error(await parseErrorMessage(triageResponse));
      const triageData = await triageResponse.json();
      if (sessionIdRef.current !== sessionId) return;

      setEmergencyFlags(triageData.emergency?.matchedFlags ?? []);
      setTriageSpecialties(triageData.specialties);
      setStage('selecting-specialties');
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function handleConfirmSpecialties(selectedIds: string[]) {
    if (selectedIds.length === 0) return; // SpecialtySelector already disables confirm at 0; defense-in-depth only

    setStage('consulting');
    const sessionId = sessionIdRef.current;

    try {
      const specialistsResponse = await fetch('/api/specialists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, specialtyIds: selectedIds }),
      });
      if (!specialistsResponse.ok) throw new Error(await parseErrorMessage(specialistsResponse));
      const specialistsData = await specialistsResponse.json();
      if (sessionIdRef.current !== sessionId) return;

      const initialOpinions: SpecialistOpinion[] = specialistsData.opinions;
      const initialQueue = mergeQuestions(initialOpinions);

      setOpinions(initialOpinions);
      setQueue(initialQueue);

      if (initialQueue.length === 0) {
        await finishInterview(initialOpinions, sessionId);
      } else {
        setStage('interview');
      }
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function handleAnswer(answerText: string, attachment?: AnswerAttachment) {
    const current = queue[0];
    if (!current) return;

    const specialtyId = current.askedBy[0].specialtyId;
    const priorOpinion = opinions.find((o) => o.specialtyId === specialtyId);
    if (!priorOpinion) return;
    const sessionId = sessionIdRef.current;

    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialtyId,
          transcript,
          priorOpinion,
          question: current.question,
          answerText,
          attachment,
        }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      if (sessionIdRef.current !== sessionId) return;

      if (data.emergency?.matchedFlags?.length) {
        setEmergencyFlags((prev) => Array.from(new Set([...prev, ...data.emergency.matchedFlags])));
      }

      const updatedOpinion: SpecialistOpinion = {
        ...data.opinion,
        specialtyId: priorOpinion.specialtyId,
        specialtyName: priorOpinion.specialtyName,
      };

      const updatedOpinions = opinions.map((o) => (o.specialtyId === specialtyId ? updatedOpinion : o));
      setOpinions(updatedOpinions);

      setQaLog((prev) => [...prev, { question: current.question, answer: answerText }]);

      // The question just answered counts toward the total, whether or not the model echoes
      // it back as a "new" follow-up question.
      const updatedAnswered = [...answeredQuestions, normalize(current.question)];
      setAnsweredQuestions(updatedAnswered);

      const remainingQueue = queue.slice(1);
      const freshQuestions = mergeQuestions([
        {
          specialtyId: updatedOpinion.specialtyId,
          specialtyName: updatedOpinion.specialtyName,
          followUpQuestions: updatedOpinion.followUpQuestions,
        },
      ]).filter((nq) => {
        const nqNormalized = normalize(nq.question);
        const alreadyAnswered = updatedAnswered.some((aq) => isSimilar(aq, nqNormalized));
        const alreadyQueued = remainingQueue.some((rq) => isSimilar(normalize(rq.question), nqNormalized));
        return !alreadyAnswered && !alreadyQueued;
      });

      const nextQueue = [...remainingQueue, ...freshQuestions];

      if (nextQueue.length === 0 || updatedAnswered.length >= MAX_TOTAL_QUESTIONS) {
        setQueue([]);
        await finishInterview(updatedOpinions, sessionId);
      } else {
        setQueue(nextQueue);
      }
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  async function saveRecord(finalOpinions: SpecialistOpinion[], finalReport: SynthesisReportType) {
    try {
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: (user?.unsafeMetadata?.phoneNumber as string | undefined) ?? '',
          prescriptionText: uploadKind === 'document' ? transcript : null,
          recordingText: uploadKind === 'audio' ? transcript : null,
          interviewRecord: { qaLog, opinions: finalOpinions, report: finalReport },
          isCritical: finalReport.redFlags.length > 0,
        }),
      });
    } catch (err) {
      console.error('의료정보 저장 실패', err);
      setSaveWarning('문진 결과를 저장하지 못했습니다. 화면에 표시된 결과는 그대로 확인하실 수 있습니다.');
    }
  }

  async function finishInterview(finalOpinions: SpecialistOpinion[], sessionId: number) {
    setStage('synthesizing');
    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opinions: finalOpinions }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      if (sessionIdRef.current !== sessionId) return;
      setReport(data.report);
      setStage('report');

      if (mode === 'member') {
        await saveRecord(finalOpinions, data.report);
      }
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStage('upload');
    }
  }

  function handleReset() {
    sessionIdRef.current += 1; // must run first — invalidates any in-flight handler's next guard check
    setStage('upload');
    setTranscript('');
    setUploadKind(null);
    setTriageSpecialties([]);
    setOpinions([]);
    setQueue([]);
    setAnsweredQuestions([]);
    setQaLog([]);
    setReport(null);
    setEmergencyFlags([]);
    setError(null);
    setSaveWarning(null);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">다중 전문의 AI 문진</h1>
        {stage !== 'upload' && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-8 bg-fill-normal px-3 py-1.5 text-sm"
          >
            처음으로
          </button>
        )}
      </div>

      {error && <p className="text-sm text-status-negative">{error}</p>}
      {saveWarning && <p className="text-sm text-status-cautionary">{saveWarning}</p>}

      <EmergencyBanner flags={emergencyFlags} />

      {stage === 'upload' && <UploadPanel onComplete={handleTranscribed} />}
      {stage === 'triaging' && <LoadingIndicator label="증상을 분석해 관련 전문분야를 찾는 중입니다..." />}

      {stage === 'selecting-specialties' && (
        <SpecialtySelector specialties={triageSpecialties} onConfirm={handleConfirmSpecialties} />
      )}

      {stage === 'consulting' && <LoadingIndicator label="전문의를 소집하는 중입니다..." />}

      {stage === 'interview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <InterviewChat key={queue[0]?.id ?? 'done'} currentQuestion={queue[0] ?? null} onAnswer={handleAnswer} />
        </>
      )}

      {stage === 'synthesizing' && <LoadingIndicator label="종합 소견을 작성하는 중입니다..." />}

      {stage === 'report' && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {opinions.map((opinion) => (
              <SpecialistCard key={opinion.specialtyId} opinion={opinion} />
            ))}
          </div>
          <SynthesisReport report={report} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: `app/page.tsx`를 임시로 `InterviewApp`만 렌더링하도록 축소**

Task 10에서 다시 손대기 전까지 회귀 확인용으로 아래처럼 임시로 둔다:

```tsx
import { InterviewApp } from '@/components/InterviewApp';

export default function Home() {
  return <InterviewApp mode="guest" />;
}
```

- [ ] **Step 3: 기존 자동 테스트 전체 실행**

Run: `npm test`
Expected: 모두 PASS (이 태스크는 순수 리팩터링 + 저장 호출 추가이므로 기존 API 테스트는 영향받지
않는다).

- [ ] **Step 4: 수동 검증**

```bash
npm run dev
```

파일 업로드 → 문진 → 종합소견까지 기존과 동일하게 동작하는지 브라우저에서 확인한다(아직 로그인
연동 전이라 `mode="guest"`이므로 저장은 호출되지 않는다).

- [ ] **Step 5: 커밋**

```bash
git add components/InterviewApp.tsx app/page.tsx
git commit -m "refactor: extract interview pipeline into InterviewApp with save-on-finish hook"
```

---

## Task 9: 로그인 진입 화면과 Clerk 인증 페이지

**Files:**
- Create: `components/WelcomeScreen.tsx`
- Create: `app/sign-in/[[...sign-in]]/page.tsx`
- Create: `app/sign-up/[[...sign-up]]/page.tsx`
- Create: `app/guest/page.tsx`
- Create: `components/CompleteProfileForm.tsx`
- Create: `app/complete-profile/page.tsx`

**Interfaces:**
- Consumes: `InterviewApp`(Task 8)
- Produces: `WelcomeScreen` 컴포넌트 — Task 10의 루트 페이지가 사용한다. `CompleteProfileForm`이
  로그인한 사용자의 `unsafeMetadata.phoneNumber`를 채우는 화면 — Task 10이 이 값이 없는 사용자를
  `/complete-profile`로 리다이렉트한다.

- [ ] **Step 1: `WelcomeScreen` 작성**

`components/WelcomeScreen.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">다중 전문의 AI 문진</h1>
      <p className="text-sm text-label-alternative">
        로그인하면 문진 결과가 저장되어 나중에 다시 확인할 수 있습니다. 로그인 없이도 게스트로 바로
        이용할 수 있지만, 이 경우 결과는 저장되지 않습니다.
      </p>

      <div className="flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="rounded-full bg-primary-normal px-4 py-2 text-center text-sm font-medium text-static-white"
        >
          로그인
        </Link>
        <Link
          href="/sign-up"
          className="rounded-8 border border-line-normal px-4 py-2 text-center text-sm font-medium"
        >
          회원가입
        </Link>
        <button
          type="button"
          onClick={() => router.push('/guest')}
          className="rounded-8 bg-fill-normal px-4 py-2 text-sm"
        >
          게스트로 계속하기
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Clerk 로그인/회원가입 페이지**

`app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
```

`app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 3: 게스트 경로**

`app/guest/page.tsx`:

```tsx
import { InterviewApp } from '@/components/InterviewApp';

export default function GuestPage() {
  return <InterviewApp mode="guest" />;
}
```

- [ ] **Step 4: 전화번호 등록 화면**

Clerk의 로그인 식별자는 이메일이다(Global Constraints 참고) — 전화번호는 로그인에 쓰이지 않고,
회원가입 직후 이 화면에서 한 번 입력받아 Clerk 사용자의 `unsafeMetadata.phoneNumber`에 저장한다.

`components/CompleteProfileForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export function CompleteProfileForm() {
  const { user } = useUser();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await user.update({ unsafeMetadata: { phoneNumber } });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">전화번호 등록</h1>
      <p className="text-sm text-label-alternative">
        의료정보 기록에 사용할 전화번호를 입력해주세요. 로그인에는 사용되지 않습니다.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="010-1234-5678"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white disabled:opacity-50"
        >
          저장
        </button>
        {error && <p className="text-sm text-status-negative">{error}</p>}
      </form>
    </main>
  );
}
```

`app/complete-profile/page.tsx`:

```tsx
import { CompleteProfileForm } from '@/components/CompleteProfileForm';

export default function CompleteProfilePage() {
  return <CompleteProfileForm />;
}
```

- [ ] **Step 5: `.env.local`에 Clerk 라우팅 환경변수 추가**

`.env.local`에 다음을 추가한다(이미 있는 `CLERK_SECRET_KEY`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 아래에):

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

- [ ] **Step 6: 수동 검증**

```bash
npm run dev
```

`/sign-up`에서 이메일+비밀번호로 회원가입 → `/sign-in`에서 같은 정보로 로그인이 되는지 확인한다.
`/guest`가 로그인 없이 기존 문진 화면을 그대로 보여주는지 확인한다. `/complete-profile`에서 전화번호를
저장하면 `/`로 돌아가는지 확인한다(Task 10 완료 전까지는 `/`가 아직 이 값을 확인하지 않으므로, 이
단계에서는 화면이 정상적으로 뜨고 제출이 되는지만 확인한다).

- [ ] **Step 7: 커밋**

```bash
git add components/WelcomeScreen.tsx components/CompleteProfileForm.tsx app/sign-in app/sign-up app/guest app/complete-profile
git commit -m "feat: add welcome screen, Clerk auth pages, guest route, and phone number capture"
```

---

## Task 10: 루트 페이지 역할 기반 라우팅

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getViewer`(Task 4), `WelcomeScreen`(Task 9), `InterviewApp`(Task 8), Clerk의
  `currentUser()`(전화번호 등록 여부 확인용)

- [ ] **Step 1: 서버 컴포넌트로 교체**

`app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { getViewer } from '@/lib/server/auth/authorize';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { InterviewApp } from '@/components/InterviewApp';

export default async function Home() {
  const viewer = await getViewer();

  if (viewer.role === 'guest') {
    return <WelcomeScreen />;
  }

  // Login uses email, not phone (Clerk's phone identifier is a paid-plan feature — see
  // Global Constraints). Phone number is collected separately into unsafeMetadata right
  // after signup, so every signed-in viewer must have it before reaching the app itself.
  const user = await currentUser();
  const phoneNumber = user?.unsafeMetadata?.phoneNumber;
  if (typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
    redirect('/complete-profile');
  }

  if (viewer.role === 'manager') {
    redirect('/dashboard');
  }
  if (viewer.role === 'admin') {
    redirect('/admin');
  }

  return <InterviewApp mode="member" />;
}
```

- [ ] **Step 2: 수동 검증**

로그아웃 상태로 `/`에 접속하면 `WelcomeScreen`이 뜨는지 확인한다. 새로 회원가입한 계정으로
로그인해서 `/`에 접속하면 `/complete-profile`로 리다이렉트되는지, 거기서 전화번호를 저장하고 나면
`/`가 이번엔 문진 화면을 바로 보여주는지 확인한다(매니져/admin 라우팅은 Task 12, 15에서 대상
페이지가 생긴 뒤 마저 확인한다).

- [ ] **Step 3: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: route root page by viewer role"
```

---

## Task 11: 매니져 대시보드 API

**Files:**
- Create: `app/api/dashboard/records/route.ts`
- Test: `tests/api/dashboard-records.test.ts`

**Interfaces:**
- Consumes: `requireManager`(Task 4), `listRecordsForOrganization`(Task 5)
- Produces: `GET /api/dashboard/records` → `{ records }` — Task 12가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api/dashboard-records.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireManagerMock = vi.fn();
const listRecordsForOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireManager: () => requireManagerMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@/lib/server/records/repository', () => ({
  listRecordsForOrganization: (id: string) => listRecordsForOrganizationMock(id),
}));

import { GET } from '@/app/api/dashboard/records/route';

describe('GET /api/dashboard/records', () => {
  beforeEach(() => {
    requireManagerMock.mockReset();
    listRecordsForOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not a manager', async () => {
    requireManagerMock.mockRejectedValue(new Error('not a manager'));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(listRecordsForOrganizationMock).not.toHaveBeenCalled();
  });

  it("scopes results to the manager's own organization", async () => {
    requireManagerMock.mockResolvedValue({ role: 'manager', userId: 'user_2', organizationId: 'org_1' });
    listRecordsForOrganizationMock.mockResolvedValue([{ id: 'rec_1', organizationId: 'org_1' }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([{ id: 'rec_1', organizationId: 'org_1' }]);
    expect(listRecordsForOrganizationMock).toHaveBeenCalledWith('org_1');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/api/dashboard-records.test.ts`
Expected: FAIL — 라우트 모듈이 없음.

- [ ] **Step 3: 구현**

`app/api/dashboard/records/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/server/auth/authorize';
import { listRecordsForOrganization } from '@/lib/server/records/repository';

export async function GET() {
  let viewer;
  try {
    viewer = await requireManager();
  } catch {
    return NextResponse.json({ error: '매니져 권한이 필요합니다.' }, { status: 403 });
  }

  const records = await listRecordsForOrganization(viewer.organizationId!);
  return NextResponse.json({ records });
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/api/dashboard-records.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/dashboard tests/api/dashboard-records.test.ts
git commit -m "feat: add manager dashboard records API scoped to caller's organization"
```

---

## Task 12: 매니져 대시보드 화면

**Files:**
- Create: `components/ManagerDashboard.tsx`
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard/records`(Task 11)

- [ ] **Step 1: `ManagerDashboard` 컴포넌트**

`components/ManagerDashboard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { MedicalRecord } from '@/lib/server/db/schema';

type DisplayRecord = Pick<
  MedicalRecord,
  'id' | 'recordDate' | 'phoneNumber' | 'isCritical' | 'historicalComparisonNote'
>;

export function ManagerDashboard() {
  const [records, setRecords] = useState<DisplayRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/dashboard/records')
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setRecords(data.records);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return <p className="p-6 text-sm text-label-alternative">불러오는 중입니다...</p>;
  if (status === 'error') return <p className="p-6 text-sm text-status-negative">데이터를 불러오지 못했습니다.</p>;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">소속단체 문진 기록</h1>
      {records.length === 0 ? (
        <p className="text-sm text-label-alternative">아직 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-12 border border-line-normal bg-background-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-normal">
                <th className="p-3">일자</th>
                <th className="p-3">전화번호</th>
                <th className="p-3">중대성 유무</th>
                <th className="p-3">과거비교 특이사항</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-line-normal last:border-0">
                  <td className="p-3">{new Date(record.recordDate).toLocaleDateString('ko-KR')}</td>
                  <td className="p-3">{record.phoneNumber}</td>
                  <td className="p-3">
                    {record.isCritical ? (
                      <span className="text-status-negative font-medium">있음</span>
                    ) : (
                      '없음'
                    )}
                  </td>
                  <td className="p-3">{record.historicalComparisonNote ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: 라우트 페이지**

`app/dashboard/page.tsx`:

```tsx
import { ManagerDashboard } from '@/components/ManagerDashboard';

export default function DashboardPage() {
  return <ManagerDashboard />;
}
```

- [ ] **Step 3: 수동 검증**

Clerk 대시보드에서 테스트 계정에 조직 역할 `org:admin`(매니져로 재사용 — Global Constraints 참고)을
임시로 부여하고 로그인해 `/dashboard`(루트 `/`에서 자동 리다이렉트)에서 표가 뜨는지 확인한다. 아직
저장된 레코드가 없다면 Task 8~10을 거친 다른 회원 계정으로 문진을 한 번 완료해 데이터를 만든다.

- [ ] **Step 4: 커밋**

```bash
git add components/ManagerDashboard.tsx app/dashboard
git commit -m "feat: add manager dashboard UI"
```

---

## Task 13: 관리자 API — 단체 생성

**Files:**
- Create: `app/api/admin/organizations/route.ts`
- Test: `tests/api/admin-organizations.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`(Task 4), Clerk `clerkClient().organizations.createOrganization`
- Produces: `POST /api/admin/organizations` (body: `{ name }` → `{ organization: { id, name } }`) —
  Task 15가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api/admin-organizations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const createOrganizationMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    organizations: { createOrganization: (input: unknown) => createOrganizationMock(input) },
  }),
}));

import { POST } from '@/app/api/admin/organizations/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/organizations', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    createOrganizationMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await POST(jsonRequest({ name: '테스트 병원' }));
    expect(response.status).toBe(403);
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it('creates an organization for admins', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    createOrganizationMock.mockResolvedValue({ id: 'org_1', name: '테스트 병원' });

    const response = await POST(jsonRequest({ name: '테스트 병원' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.organization).toEqual({ id: 'org_1', name: '테스트 병원' });
  });

  it('rejects malformed bodies', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/api/admin-organizations.test.ts`
Expected: FAIL — 라우트 모듈이 없음.

- [ ] **Step 3: 구현**

`app/api/admin/organizations/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/server/auth/authorize';

const createOrganizationSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const client = await clerkClient();
  const organization = await client.organizations.createOrganization({ name: parsed.data.name });

  return NextResponse.json({ organization: { id: organization.id, name: organization.name } });
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/api/admin-organizations.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/organizations tests/api/admin-organizations.test.ts
git commit -m "feat: add admin API to create organizations"
```

---

## Task 14: 관리자 API — 매니져 임명

**Files:**
- Create: `app/api/admin/members/route.ts`
- Test: `tests/api/admin-members.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`(Task 4), Clerk `clerkClient().organizations`
  (`getOrganizationMembershipList`, `createOrganizationMembership`, `updateOrganizationMembership`)
- Produces: `PATCH /api/admin/members` (body: `{ organizationId, userId, role: 'org:member' |
  'org:admin' }` → `{ membership: { userId, organizationId, role } }`) — Task 15가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api/admin-members.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const getOrganizationMembershipListMock = vi.fn();
const createOrganizationMembershipMock = vi.fn();
const updateOrganizationMembershipMock = vi.fn();

vi.mock('@/lib/server/auth/authorize', () => ({
  requireAdmin: () => requireAdminMock(),
  AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: (input: unknown) => getOrganizationMembershipListMock(input),
      createOrganizationMembership: (input: unknown) => createOrganizationMembershipMock(input),
      updateOrganizationMembership: (input: unknown) => updateOrganizationMembershipMock(input),
    },
  }),
}));

import { PATCH } from '@/app/api/admin/members/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/members', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/members', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    getOrganizationMembershipListMock.mockReset();
    createOrganizationMembershipMock.mockReset();
    updateOrganizationMembershipMock.mockReset();
  });

  it('returns 403 when the caller is not admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('not admin'));
    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));
    expect(response.status).toBe(403);
  });

  it('creates a new membership when the user is not yet a member', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    getOrganizationMembershipListMock.mockResolvedValue({ data: [] });
    createOrganizationMembershipMock.mockResolvedValue({ role: 'org:admin' });

    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_2',
      role: 'org:admin',
    });
    expect(updateOrganizationMembershipMock).not.toHaveBeenCalled();
    expect(data.membership).toEqual({ userId: 'user_2', organizationId: 'org_1', role: 'org:admin' });
  });

  it('updates the role when the user is already a member', async () => {
    requireAdminMock.mockResolvedValue({ role: 'admin', userId: 'admin_1', organizationId: null });
    getOrganizationMembershipListMock.mockResolvedValue({
      data: [{ publicUserData: { userId: 'user_2' }, role: 'org:member' }],
    });
    updateOrganizationMembershipMock.mockResolvedValue({ role: 'org:admin' });

    const response = await PATCH(jsonRequest({ organizationId: 'org_1', userId: 'user_2', role: 'org:admin' }));

    expect(response.status).toBe(200);
    expect(updateOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_2',
      role: 'org:admin',
    });
    expect(createOrganizationMembershipMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npm test -- tests/api/admin-members.test.ts`
Expected: FAIL — 라우트 모듈이 없음.

- [ ] **Step 3: 구현**

`app/api/admin/members/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/server/auth/authorize';

const assignMemberSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['org:member', 'org:admin']),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'admin 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = assignMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { organizationId, userId, role } = parsed.data;
  const client = await clerkClient();

  const memberships = await client.organizations.getOrganizationMembershipList({ organizationId });
  const existing = memberships.data.find(
    (m: { publicUserData?: { userId?: string } }) => m.publicUserData?.userId === userId,
  );

  const membership = existing
    ? await client.organizations.updateOrganizationMembership({ organizationId, userId, role })
    : await client.organizations.createOrganizationMembership({ organizationId, userId, role });

  return NextResponse.json({ membership: { userId, organizationId, role: membership.role } });
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npm test -- tests/api/admin-members.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/members tests/api/admin-members.test.ts
git commit -m "feat: add admin API to assign organization membership and manager role"
```

---

## Task 15: 관리자 화면

**Files:**
- Create: `components/AdminPanel.tsx`
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/organizations`(Task 13), `PATCH /api/admin/members`(Task 14)

- [ ] **Step 1: `AdminPanel` 컴포넌트**

`components/AdminPanel.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';

export function AdminPanel() {
  const [orgName, setOrgName] = useState('');
  const [orgResult, setOrgResult] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [organizationId, setOrganizationId] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'org:member' | 'org:admin'>('org:admin');
  const [memberResult, setMemberResult] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  async function handleCreateOrganization(event: FormEvent) {
    event.preventDefault();
    setOrgError(null);
    setOrgResult(null);
    try {
      const response = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '단체 생성에 실패했습니다.');
      setOrgResult(`생성됨: ${data.organization.name} (ID: ${data.organization.id})`);
      setOrgName('');
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }

  async function handleAssignMember(event: FormEvent) {
    event.preventDefault();
    setMemberError(null);
    setMemberResult(null);
    try {
      const response = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, userId, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '역할 지정에 실패했습니다.');
      setMemberResult(`지정됨: ${data.membership.userId} → ${data.membership.role}`);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">관리자</h1>

      <form onSubmit={handleCreateOrganization} className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">단체 생성</h2>
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="단체 이름"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <button type="submit" className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white">
          생성
        </button>
        {orgResult && <p className="text-sm text-status-positive">{orgResult}</p>}
        {orgError && <p className="text-sm text-status-negative">{orgError}</p>}
      </form>

      <form onSubmit={handleAssignMember} className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">회원 단체 배정 / 매니져 임명</h2>
        <p className="text-sm text-label-alternative">
          대상 회원의 Clerk User ID는 Clerk 대시보드에서 확인할 수 있습니다.
        </p>
        <input
          type="text"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          placeholder="단체 ID (org_...)"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="회원 User ID (user_...)"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'org:member' | 'org:admin')}
          className="rounded-8 border border-line-normal p-2 text-sm"
        >
          <option value="org:admin">매니져</option>
          <option value="org:member">일반 회원</option>
        </select>
        <button type="submit" className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white">
          지정
        </button>
        {memberResult && <p className="text-sm text-status-positive">{memberResult}</p>}
        {memberError && <p className="text-sm text-status-negative">{memberError}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 라우트 페이지**

`app/admin/page.tsx`:

```tsx
import { AdminPanel } from '@/components/AdminPanel';

export default function AdminPage() {
  return <AdminPanel />;
}
```

- [ ] **Step 3: 수동 검증**

Task 16에서 만든 시드 admin으로 로그인해 `/admin`(루트 `/`에서 자동 리다이렉트)에서 단체를 하나
생성하고, 다른 테스트 계정을 그 단체의 매니져로 지정한 뒤 그 계정으로 로그인해 `/dashboard`가
정상 동작하는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add components/AdminPanel.tsx app/admin
git commit -m "feat: add admin UI for organization and manager management"
```

---

## Task 16: 시드 Admin 스크립트

**Files:**
- Create: `scripts/seed-admin.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: 스크립트 작성**

`scripts/seed-admin.ts`:

```ts
import 'dotenv/config';
import { clerkClient } from '@clerk/nextjs/server';

async function main() {
  // Login identifier is email, not phone (Clerk's phone identifier is Pro-plan only —
  // see Global Constraints), so admin lookup is by email too.
  const email = process.argv[2];
  if (!email) {
    console.error('사용법: npm run seed:admin -- admin@example.com');
    process.exit(1);
  }

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: [email] });
  const user = users[0];

  if (!user) {
    console.error(`이메일 ${email}로 가입된 사용자를 찾을 수 없습니다. 먼저 회원가입을 완료하세요.`);
    process.exit(1);
  }

  await client.users.updateUserMetadata(user.id, {
    publicMetadata: { role: 'admin' },
  });

  console.log(`사용자 ${user.id}를 admin으로 지정했습니다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: npm 스크립트 추가**

`package.json`의 `scripts`에 추가:

```json
"seed:admin": "dotenv -e .env.local -- tsx scripts/seed-admin.ts"
```

`tsx`가 devDependencies에 없다면 추가한다:

```bash
npm install -D tsx
```

- [ ] **Step 3: 수동 검증**

Task 1에서 정한 이메일로 먼저 `/sign-up`을 통해 실제로 회원가입하고 `/complete-profile`에서 전화번호도
등록한 뒤:

```bash
npm run seed:admin -- admin@example.com
```

그 계정으로 로그인해 `/`가 `/admin`으로 리다이렉트되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed-admin.ts package.json package-lock.json
git commit -m "feat: add one-time admin seed script"
```

---

## Task 17: `lib/server` 경계를 지키는 ESLint 규칙

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: 규칙 추가**

`eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      // Use the @typescript-eslint variant (not core no-restricted-imports) so
      // `allowTypeImports: true` can exempt `import type { MedicalRecord } from
      // '@/lib/server/db/schema'` (ManagerDashboard.tsx) — a type-only import has
      // no runtime/bundle effect, so it doesn't cross the client/server boundary
      // this rule exists to protect. Value imports of lib/server are still blocked.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/server/*", "@/lib/server"],
              message:
                "components/**는 클라이언트 UI 전용입니다. lib/server는 app/api/** 라우트에서만 사용하세요(타입만 필요하면 import type은 허용됩니다).",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

- [ ] **Step 2: 규칙이 실제로 걸리는지 임시로 검증**

`components/ManagerDashboard.tsx` 맨 위에 임시로 `import { getDb } from '@/lib/server/db/client';`를
추가하고 실행한다:

```bash
npm run lint
```

Expected: `no-restricted-imports` 에러가 뜬다. 확인 후 방금 추가한 줄을 삭제한다.

- [ ] **Step 3: 전체 lint 통과 확인**

```bash
npm run lint
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add eslint.config.mjs
git commit -m "chore: forbid components/** from importing lib/server directly"
```

---

## Task 18: 문서 업데이트 (`CLAUDE.md`, `harness.md`, `agent.md`)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `harness.md`

- [ ] **Step 1: `CLAUDE.md`의 "서버 측 영구 저장 없음" 제약을 갱신**

`CLAUDE.md`의 핵심 전역 제약 목록에서 다음 항목을 찾아:

> - 서버 측 영구 저장 없음: 오디오, 전사문, 문진 답변을 DB/파일/Blob에 저장하지 않는다. 클라이언트 React state로만 유지한다.

아래로 교체한다:

```markdown
- 회원가입/로그인(Clerk, 이메일+비밀번호 — 전화번호는 가입 후 별도 화면에서 입력받아 프로필로만
  저장)이 필요하며, 로그인한 회원의 문진 결과는 Neon Postgres(`medical_records` 테이블)에 영구
  저장된다. 단, 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다. 게스트
  로그인은 기존과 동일하게 아무것도 저장하지 않는다. 자세한 내용은
  `docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md` 참고.
```

- [ ] **Step 2: `harness.md`의 "서버 미저장 원칙" 절 갱신**

`harness.md`의 `## "서버 미저장" 원칙` 섹션 전체를 아래로 교체한다:

```markdown
## 회원/저장 아키텍처

로그인(Clerk, 이메일+비밀번호)한 회원의 문진 결과는 `medical_records` 테이블(Neon Postgres,
Drizzle)에 영구 저장된다 — 원본 오디오/이미지 파일은 저장하지 않고 AI가 추출한 텍스트만 저장한다.
전화번호는 Clerk의 로그인 식별자가 아니라(Pro 유료 플랜 전용 기능이라 쓰지 않음), 회원가입 직후
`/complete-profile` 화면에서 입력받아 `unsafeMetadata.phoneNumber`로 저장하는 프로필 필드다.
게스트(로그인하지 않은 세션)는 기존과 동일하게 서버에 아무것도 저장하지 않으며, 모든 상태가
클라이언트 React state에만 존재한다.

역할은 게스트/일반 회원/매니져/관리자 네 가지이며, Clerk가 회원정보(이메일, 전화번호, 소속단체,
매니져여부)의 단일 진실 공급원이다. 매니져는 자신이 속한 단체의 의료정보를 일자별로 조회할 수
있고, 관리자는 단체 생성과 매니져 임명을 담당한다. 자세한 아키텍처는
`docs/superpowers/specs/2026-09-11-accounts-medical-records-design.md`와
`docs/superpowers/plans/2026-09-11-accounts-medical-records-plan.md` 참고.
```

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md harness.md
git commit -m "docs: update global constraints and harness docs for accounts and storage"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 스펙 §1~§9의 모든 요구사항(인증, 역할, 데이터 모델, 인가 강제 지점, 저장소
  구조, 파이프라인 통합, 보안, 에러 처리, 테스트)에 대응하는 태스크가 있다. §11(범위 밖 항목)은
  의도적으로 태스크화하지 않았다.
- **플레이스홀더 스캔**: "TBD"/"TODO" 없음. 모든 코드 블록은 실제로 실행 가능한 전체 파일 또는
  명확한 삽입 위치를 포함한다.
- **타입 일관성**: `Viewer`/`ViewerRole`(Task 4)가 Task 6, 11, 13, 14에서 동일하게 쓰인다.
  `NewMedicalRecord`/`MedicalRecord`(Task 2)가 Task 5, 12에서 동일하게 쓰인다. `UploadKind`(Task 7)가
  Task 8에서 동일하게 쓰인다.
